// AI moderation: each message is scored by OpenAI's moderation endpoint (free to call, needs OPENAI_API_KEY) or,
// when only ANTHROPIC_API_KEY is set, by a small Claude model asked for a one-line verdict. Only clear cases are
// acted on; everything else is left to the human mods. Calls are rate-limited and repeated text is cached.
import { createHash } from "node:crypto";
import { HttpError, fetchJson } from "./feeds/http.js";
import { logger } from "../logger.js";

export type AiVerdict = { action: "remove" | "flag" | "allow"; category: string; score: number };

const CACHE_TTL_MS = 10 * 60_000;
const MAX_CALLS_PER_MINUTE = 30;
/** free tiers allow only a handful of requests a minute; a 429 pauses the provider for this long */
const BACKOFF_MS = 30_000;
const cache = new Map<string, { verdict: AiVerdict; at: number }>();
const calls = new Map<string, number[]>();
let pausedUntil = 0;
let lastPauseWarning = 0;

export type AiProvider = "openai" | "gemini" | "anthropic" | null;

export function aiProvider(): AiProvider {
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

const VERDICT_PROMPT =
  'You moderate a Discord chat. Reply with one JSON object only: {"action":"remove"|"flag"|"allow","category":"...","score":0..1}. ' +
  "remove = clear threats, targeted harassment, hate speech, sexual content involving minors, or instructions for self-harm or violence. " +
  "Messages may be in any language or script, including Hinglish (Hindi in Latin letters): slurs such as madarchod, bhenchod, randi, chutiya aimed at a person are targeted harassment. " +
  "flag = borderline or a slur used as a bare exclamation, worth a human look. allow = everything else, including mild swearing, banter and dark humour.";

/** the classifier must be allowed to read abusive text, so Google's own input filters are switched off */
const GEMINI_SAFETY = ["HARM_CATEGORY_HARASSMENT", "HARM_CATEGORY_HATE_SPEECH", "HARM_CATEGORY_SEXUALLY_EXPLICIT", "HARM_CATEGORY_DANGEROUS_CONTENT"].map((category) => ({
  category,
  threshold: "BLOCK_NONE",
}));

/** Google's current small model, with the dated name as a fallback should the alias ever go */
const GEMINI_MODELS = ["gemini-flash-lite-latest", "gemini-3.5-flash-lite"];

function parseVerdict(raw: string): AiVerdict {
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return { action: "allow", category: "none", score: 0 };
  try {
    const parsed = JSON.parse(json) as Partial<AiVerdict>;
    const action = parsed.action === "remove" || parsed.action === "flag" ? parsed.action : "allow";
    return { action, category: String(parsed.category ?? "unspecified").slice(0, 40), score: Number(parsed.score ?? 0) };
  } catch {
    return { action: "allow", category: "none", score: 0 };
  }
}

async function askGemini(text: string): Promise<AiVerdict> {
  let lastError: unknown = null;
  let overloadRetries = 1;
  for (let i = 0; i < GEMINI_MODELS.length; i++) {
    const model = GEMINI_MODELS[i] as string;
    try {
      const res = await fetchJson<{
        candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>;
        promptFeedback?: { blockReason?: string };
      }>(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: VERDICT_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: text.slice(0, 2000) }] }],
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: 80, temperature: 0 },
          safetySettings: GEMINI_SAFETY,
        }),
        timeoutMs: 8_000,
      });
      // when Google refuses to even look at the text, that is itself worth a human look
      if (res.promptFeedback?.blockReason) return { action: "flag", category: `blocked by google (${res.promptFeedback.blockReason.toLowerCase()})`, score: 0.5 };
      const candidate = res.candidates?.[0];
      const raw = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!raw && candidate?.finishReason && candidate.finishReason !== "STOP") return { action: "flag", category: `no verdict (${candidate.finishReason.toLowerCase()})`, score: 0.5 };
      return parseVerdict(raw);
    } catch (err) {
      lastError = err;
      // a momentary overload gets one more try with the same model; a missing model falls through to the next name
      if (err instanceof HttpError && err.status === 503 && overloadRetries-- > 0) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        i--;
        continue;
      }
      if (!(err instanceof HttpError && err.status === 404)) break;
    }
  }
  throw lastError ?? new Error("gemini unavailable");
}

/** categories that are removed outright when the model marks them */
const SEVERE = new Set(["harassment/threatening", "hate/threatening", "sexual/minors", "self-harm/instructions", "self-harm/intent", "illicit/violent", "violence/graphic"]);
/** categories removed only when the model is very sure */
const STRONG_AT = 0.85;
const STRONG = new Set(["hate", "harassment", "sexual", "violence", "self-harm", "illicit"]);

/** OpenAI's categories and scores → what to do (pure, so the thresholds are testable) */
export function decideFromScores(categories: Record<string, boolean>, scores: Record<string, number>): AiVerdict {
  let top: { category: string; score: number } = { category: "none", score: 0 };
  for (const [category, score] of Object.entries(scores)) if (score > top.score) top = { category, score };
  for (const category of SEVERE) if (categories[category]) return { action: "remove", category, score: scores[category] ?? 1 };
  for (const category of STRONG) if ((scores[category] ?? 0) >= STRONG_AT) return { action: "remove", category, score: scores[category] ?? 0 };
  const flagged = Object.values(categories).some(Boolean);
  return { action: flagged ? "flag" : "allow", category: top.category, score: top.score };
}

function underRateLimit(guildId: string) {
  const now = Date.now();
  const recent = (calls.get(guildId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= MAX_CALLS_PER_MINUTE) {
    calls.set(guildId, recent);
    return false;
  }
  recent.push(now);
  calls.set(guildId, recent);
  return true;
}

async function askOpenAi(text: string): Promise<AiVerdict> {
  const res = await fetchJson<{ results?: Array<{ flagged: boolean; categories: Record<string, boolean>; category_scores: Record<string, number> }> }>(
    "https://api.openai.com/v1/moderations",
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: "omni-moderation-latest", input: text }),
      timeoutMs: 6_000,
    },
  );
  const result = res.results?.[0];
  if (!result) return { action: "allow", category: "none", score: 0 };
  return decideFromScores(result.categories ?? {}, result.category_scores ?? {});
}

async function askAnthropic(text: string): Promise<AiVerdict> {
  const res = await fetchJson<{ content?: Array<{ type: string; text?: string }> }>("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-5-5",
      max_tokens: 60,
      system: VERDICT_PROMPT,
      messages: [{ role: "user", content: text.slice(0, 2000) }],
    }),
    timeoutMs: 8_000,
  });
  return parseVerdict(res.content?.find((c) => c.type === "text")?.text ?? "");
}

/** null when no provider is configured, the text is too short, or the server is over its minute's allowance */
export async function classifyMessage(guildId: string, text: string): Promise<AiVerdict | null> {
  const provider = aiProvider();
  const trimmed = text.trim();
  if (!provider || trimmed.length < 6) return null;
  const key = createHash("sha1").update(trimmed.toLowerCase()).digest("hex");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.verdict;
  if (Date.now() < pausedUntil) return null;
  if (!underRateLimit(guildId)) return null;
  try {
    const verdict = provider === "openai" ? await askOpenAi(trimmed) : provider === "gemini" ? await askGemini(trimmed) : await askAnthropic(trimmed);
    cache.set(key, { verdict, at: Date.now() });
    if (cache.size > 5000) for (const [k, v] of cache) if (Date.now() - v.at > CACHE_TTL_MS) cache.delete(k);
    return verdict;
  } catch (err) {
    if (err instanceof HttpError && (err.status === 429 || err.status === 503)) {
      pausedUntil = Date.now() + BACKOFF_MS;
      if (Date.now() - lastPauseWarning > 10 * 60_000) {
        lastPauseWarning = Date.now();
        logger.warn({ provider, status: err.status }, "ai moderation rate-limited by the provider; messages pass to the plain filters for 30 s at a time");
      }
      return null;
    }
    logger.debug({ err, provider }, "ai moderation call failed");
    return null;
  }
}
