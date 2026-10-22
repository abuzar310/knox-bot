// Bounded HTTP reads for feed polling: a timeout, a size cap, a plain User-Agent and, when asked, a public-only
// check on every redirect hop, so one slow, huge or hostile feed can't stall the job tick or reach the host.
import { isSafePublicUrl } from "../safe-url.js";
import { SourceError } from "./errors.js";

const USER_AGENT = "ZARU-Discord-Bot/1.0 (+https://github.com/abuzar310/knox-bot)";
const MAX_REDIRECTS = 5;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly snippet = "",
  ) {
    super(`HTTP ${status} from ${new URL(url).hostname}`);
    this.name = "HttpError";
  }
}

export type FetchTextOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
  /** refuse any hop that isn't a public web address (for addresses members typed) */
  publicOnly?: boolean;
};

export async function fetchText(url: string, opts: FetchTextOptions = {}): Promise<string> {
  const { timeoutMs = 10_000, maxBytes = 2_000_000, headers = {}, publicOnly = false } = opts;
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (publicOnly && !(await isSafePublicUrl(current))) throw new SourceError("That address isn't a public website ZARU may read.");
    const res = await fetch(current, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8",
        ...headers,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel().catch(() => undefined);
      if (!location) throw new HttpError(res.status, current);
      current = new URL(location, current).toString();
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new HttpError(res.status, current);
    }
    return readCapped(res, maxBytes);
  }
  throw new SourceError("That address redirects too many times.");
}

export async function fetchJson<T>(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {},
): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: { "user-agent": USER_AGENT, accept: "application/json", ...init.headers },
    body: init.body,
    signal: AbortSignal.timeout(init.timeoutMs ?? 10_000),
  });
  const text = await readCapped(res, 2_000_000);
  if (!res.ok) throw new HttpError(res.status, url, text.slice(0, 200));
  return JSON.parse(text) as T;
}

/** runs an API call once more with a fresh token when the first answer is 401 */
export async function retryOnUnauthorized<T>(call: (freshToken: boolean) => Promise<T>): Promise<T> {
  try {
    return await call(false);
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) return call(true);
    throw err;
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new SourceError(`That source is larger than ${Math.round(maxBytes / 1_000_000)} MB; ZARU only reads feeds.`);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
