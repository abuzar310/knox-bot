// One structured question to whichever AI key the host has (Gemini, OpenAI or Claude), answered as JSON.
import { HttpError, fetchJson } from "./feeds/http.js";
import { aiProvider } from "./ai-moderation.js";
import { logger } from "../logger.js";

export type JsonSchema = Record<string, unknown>;

function extractJson(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no JSON object in the answer");
  return JSON.parse(text.slice(start, end + 1));
}

/** null when no provider is configured or the call failed; callers fall back to rules */
export async function askJson<T>(system: string, user: string, schema: JsonSchema, maxTokens = 2000): Promise<T | null> {
  const provider = aiProvider();
  if (!provider) return null;
  try {
    if (provider === "gemini") {
      const ask = () =>
        fetchJson<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }>(
          // the lite model is the fastest this key has (a few seconds to ~20 s depending on Google's load); the standard
          // "thinking" model took minutes and is often overloaded (it also rejects a thinking-off flag, so none is sent)
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent",
          {
            method: "POST",
            headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents: [{ role: "user", parts: [{ text: user }] }],
              generationConfig: { responseMimeType: "application/json", responseSchema: schema, maxOutputTokens: maxTokens, temperature: 0.2 },
            }),
            timeoutMs: 60_000,
          },
        );
      let res: Awaited<ReturnType<typeof ask>>;
      try {
        res = await ask();
      } catch (err) {
        // the free tier answers 429/503 now and then; one more try after a short pause usually goes through
        if (!(err instanceof HttpError && (err.status === 429 || err.status === 503))) throw err;
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        res = await ask();
      }
      return extractJson(res.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "") as T;
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
            { role: "system", content: `${system}\nAnswer with JSON matching this schema: ${JSON.stringify(schema)}` },
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
        system: `${system}\nAnswer with one JSON object only, matching this schema: ${JSON.stringify(schema)}`,
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
