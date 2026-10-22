// Known phishing / scam domains, pooled from community-maintained lists and refreshed every six hours, plus a few
// look-alike rules (fake "discord"/"nitro"/"steam" hosts) that work even before the lists have loaded.
import { fetchText } from "../feeds/http.js";
import { logger } from "../../logger.js";

type Source = { url: string; pick: (json: unknown) => unknown; headers?: Record<string, string> };

const SOURCES: Source[] = [
  { url: "https://raw.githubusercontent.com/Discord-AntiScam/scam-links/main/list.json", pick: (json) => json },
  {
    url: "https://phish.sinking.yachts/v2/all",
    pick: (json) => json,
    headers: { "x-identity": "ZARU Discord bot (github.com/abuzar310/knox-bot)" },
  },
  { url: "https://raw.githubusercontent.com/nikolaischunk/discord-phishing-links/main/domain-list.json", pick: (json) => (json as { domains?: unknown }).domains },
];
const REFRESH_MS = 6 * 60 * 60_000;
const RETRY_MS = 10 * 60_000;

/** hosts that are allowed to look like Discord or Steam, because they are */
const OFFICIAL = new Set([
  "discord.com",
  "discord.gg",
  "discordapp.com",
  "discordapp.net",
  "discord.media",
  "discord.dev",
  "discord.new",
  "discord.co",
  "discordstatus.com",
  "discordmerch.com",
  "discord-activities.com",
  "dis.gd",
  "steamcommunity.com",
  "steampowered.com",
  "steamgames.com",
  "steamstatic.com",
  "steamusercontent.com",
  "steamcontent.com",
  "s.team",
  "steam.tv",
]);

let domains = new Set<string>();
let loadedAt = 0;
let attemptedAt = 0;
let loading: Promise<void> | null = null;

export function phishListSize() {
  return domains.size;
}

export function normalizeHost(host: string) {
  return host.trim().toLowerCase().replace(/^\*\./, "").replace(/^www\./, "").replace(/\.$/, "");
}

/** loads or refreshes the pooled list; never throws, a failed source is skipped */
export function refreshPhishList(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - loadedAt < REFRESH_MS) return Promise.resolve();
  if (!force && now - attemptedAt < RETRY_MS) return Promise.resolve();
  if (loading) return loading;
  attemptedAt = now;
  loading = (async () => {
    const next = new Set<string>();
    let sources = 0;
    for (const source of SOURCES) {
      try {
        const text = await fetchText(source.url, {
          timeoutMs: 20_000,
          maxBytes: 8_000_000,
          headers: { accept: "application/json", ...(source.headers ?? {}) },
        });
        const list = source.pick(JSON.parse(text));
        if (!Array.isArray(list)) continue;
        for (const entry of list) if (typeof entry === "string" && entry.includes(".")) next.add(normalizeHost(entry));
        sources++;
      } catch (err) {
        logger.debug({ err, url: source.url }, "phishing list source failed");
      }
    }
    if (sources > 0) {
      domains = next;
      loadedAt = Date.now();
      logger.info({ domains: next.size, sources }, "phishing list loaded");
    } else if (!loadedAt) {
      logger.warn("phishing list unavailable for now; only the look-alike rules apply");
    }
  })().finally(() => {
    loading = null;
  });
  return loading;
}

export type PhishHit = { host: string; reason: "listed" | "lookalike" };

/** the host and each parent domain are looked up, so a listed domain catches all its subdomains */
export function isListedHost(host: string, list: ReadonlySet<string> = domains): boolean {
  const labels = normalizeHost(host).split(".");
  for (let i = 0; i <= labels.length - 2; i++) {
    if (list.has(labels.slice(i).join("."))) return true;
  }
  return false;
}

function isOfficial(host: string) {
  const labels = normalizeHost(host).split(".");
  for (let i = 0; i <= labels.length - 2; i++) {
    if (OFFICIAL.has(labels.slice(i).join("."))) return true;
  }
  return false;
}

/** fake-brand hosts: "discord" spelled with look-alike letters, "nitro" next to free/gift words, fake Steam */
export function lookalikeReason(host: string): string | null {
  if (isOfficial(host)) return null;
  const flat = normalizeHost(host).replace(/[-.]/g, "");
  if (/d[il1]sc[o0]rd/.test(flat)) return "looks like Discord";
  if (/n[il1]tr[o0]/.test(flat) && /(free|g[il1]ft|pr[o0]m[o0]|a[il1]rdr[o0]p|m[o0]nth|steam|b[o0]{2}st|claim)/.test(flat)) return "fake Nitro offer";
  if (/ste[a4]m/.test(flat) && /(c[o0]mmun[il1]ty|p[o0]wered|g[il1]ft|trade|wallet|c[o0]nnect)/.test(flat)) return "looks like Steam";
  return null;
}

const LINK_RE = /(https?:\/\/)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})(?=$|[\s/?#:,;!)>\]"'*_~`|])/gi;

/** the hosts a message links to; `explicit` hosts came with http(s)://, bare ones were just typed */
export function extractHosts(content: string): Array<{ host: string; explicit: boolean }> {
  const out: Array<{ host: string; explicit: boolean }> = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(LINK_RE)) {
    const host = normalizeHost(match[2] ?? "");
    if (!host || seen.has(host)) continue;
    seen.add(host);
    out.push({ host, explicit: Boolean(match[1]) });
  }
  return out;
}

/**
 * The first phishing host in a message. Listed domains count however they were typed; the look-alike rules only
 * apply to real links (with http/https), so prose like "see discord.txt" is never punished.
 */
export function findPhishingHost(content: string, list: ReadonlySet<string> = domains): PhishHit | null {
  for (const { host, explicit } of extractHosts(content)) {
    if (isListedHost(host, list)) return { host, reason: "listed" };
    if (explicit && lookalikeReason(host)) return { host, reason: "lookalike" };
  }
  return null;
}
