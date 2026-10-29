// One structured question to whichever AI key the host has (Gemini, OpenAI or Claude), answered as JSON.
import { HttpError, fetchJson } from "./feeds/http.js";
import { aiProvider } from "./ai-moderation.js";
import { logger } from "../logger.js";

export type JsonSchema = Record<string, unknown>;

type GeminiPart = { text?: string; thought?: boolean };

/** the spoken JSON, skipping a thought part that would otherwise swallow the object */
export function geminiAnswerText(parts: GeminiPart[] | undefined): string {
  const list = parts ?? [];
  const spoken = list.filter((part) => part.thought !== true && part.text);
  const use = spoken.length ? spoken : list;
  return use.map((part) => part.text ?? "").join("");
}

/** first complete object, so a second JSON blob or a trailing note does not break the parse */
export function extractJson(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = text.indexOf("{");
  if (start < 0) throw new Error("no JSON object in the answer");
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error("no JSON object in the answer");
}

export type AskOptions = {
  /**
   * false = JSON mode without Gemini's constrained decoding, the schema goes in as text instead. The lite model fills a
   * schema of many optional properties badly (it skips the ones ordered before the one it "thinks of" first and pads the
   * rest with empty values); given worked examples it writes the same JSON correctly on its own.
   */
  enforceSchema?: boolean;
};

/** worth one more try after a short pause: rate limit, overload, a dropped connection, or our own timeout */
function transient(err: unknown) {
  if (err instanceof HttpError) return err.status === 429 || err.status === 500 || err.status === 503 || err.status === 504;
  if (err instanceof Error) return err.name === "TimeoutError" || err.name === "AbortError" || /fetch failed|socket|ECONNRESET|other side closed/i.test(err.message);
  return false;
}

const schemaText = (schema: JsonSchema) => JSON.stringify(schema, (key, value: unknown) => (key === "propertyOrdering" ? undefined : value));

/** a plain conversational answer from whichever AI key the host has; null when none is set or the call fails */
export async function askText(system: string, user: string, maxTokens = 500, temperature = 0.7): Promise<string | null> {
  const provider = aiProvider();
  if (!provider) return null;
  const run = async (): Promise<string> => {
    if (provider === "gemini") {
      const res = await fetchJson<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }>("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent", {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { maxOutputTokens: maxTokens, temperature } }),
        timeoutMs: 60_000,
      });
      return res.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
    }
    if (provider === "openai") {
      const res = await fetchJson<{ choices?: Array<{ message?: { content?: string } }> }>("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: "gpt-4.1-mini", max_tokens: maxTokens, temperature, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
        timeoutMs: 45_000,
      });
      return res.choices?.[0]?.message?.content?.trim() ?? "";
    }
    const res = await fetchJson<{ content?: Array<{ type: string; text?: string }> }>("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-5-5", max_tokens: maxTokens, temperature, system, messages: [{ role: "user", content: user }] }),
      timeoutMs: 45_000,
    });
    return res.content?.find((c) => c.type === "text")?.text?.trim() ?? "";
  };
  try {
    return await run();
  } catch (err) {
    if (!transient(err)) {
      logger.warn({ err, provider }, "ai text failed");
      return null;
    }
    await new Promise((r) => setTimeout(r, 2_000));
    try {
      return await run();
    } catch (e) {
      logger.warn({ err: e, provider }, "ai text failed after retry");
      return null;
    }
  }
}

/** null when no provider is configured or the call failed; callers fall back to rules */
export async function askJson<T>(system: string, user: string, schema: JsonSchema, maxTokens = 2000, options: AskOptions = {}): Promise<T | null> {
  const provider = aiProvider();
  if (!provider) return null;
  const enforce = options.enforceSchema ?? true;
  try {
    if (provider === "gemini") {
      const ask = () =>
        fetchJson<{ candidates?: Array<{ finishReason?: string; content?: { parts?: GeminiPart[] } }> }>(
          // the lite model is the fastest this key has (a few seconds to ~20 s depending on Google's load); the standard
          // "thinking" model took minutes and is often overloaded (it also rejects a thinking-off flag, so none is sent)
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent",
          {
            method: "POST",
            headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: enforce ? system : `${system}\nAnswer with one JSON object matching this schema: ${schemaText(schema)}` }] },
              contents: [{ role: "user", parts: [{ text: user }] }],
              generationConfig: { responseMimeType: "application/json", ...(enforce ? { responseSchema: schema } : {}), maxOutputTokens: maxTokens, temperature: 0.2 },
            }),
            timeoutMs: 60_000,
          },
        );
      let res: Awaited<ReturnType<typeof ask>>;
      try {
        res = await ask();
      } catch (err) {
        // the free tier answers 429/503 or drops the connection now and then; one more try usually goes through
        if (!transient(err)) throw err;
        logger.debug({ err }, "gemini call failed once; retrying");
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        res = await ask();
      }
      const read = (body: Awaited<ReturnType<typeof ask>>) => {
        const text = geminiAnswerText(body.candidates?.[0]?.content?.parts);
        try {
          return extractJson(text) as T;
        } catch (err) {
          logger.warn(
            { err, finishReason: body.candidates?.[0]?.finishReason, chars: text.length, snippet: text.slice(0, 180).replace(/\s+/g, " ") },
            "gemini json parse failed",
          );
          throw err;
        }
      };
      try {
        return read(res);
      } catch {
        // a second object used to break the parse; one more call usually comes back as a single object
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        return read(await ask());
      }
    }
    if (provider === "openai") {
      const res = await fetchJson<{ choices?: Array<{ message?: { content?: string } }> }>("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          response_format: { type: "json_object" },
          max_tokens: maxTokens,
          temperature: 0.2,
          messages: [
            { role: "system", content: `${system}\nAnswer with JSON matching this schema: ${schemaText(schema)}` },
            { role: "user", content: user },
          ],
        }),
        timeoutMs: 45_000,
      });
      return extractJson(res.choices?.[0]?.message?.content ?? "") as T;
    }
    const res = await fetchJson<{ content?: Array<{ type: string; text?: string }> }>("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-5-5",
        max_tokens: maxTokens,
        system: `${system}\nAnswer with one JSON object only, matching this schema: ${schemaText(schema)}`,
        messages: [{ role: "user", content: user }],
      }),
      timeoutMs: 45_000,
    });
    return extractJson(res.content?.find((c) => c.type === "text")?.text ?? "") as T;
  } catch (err) {
    logger.warn({ err, provider }, "ai json question failed; using rules instead");
    return null;
  }
}
