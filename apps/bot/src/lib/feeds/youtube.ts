// YouTube without an API key: every channel has a public Atom feed, and a channel page names its UC… id.
import { fetchText } from "./http.js";
import { SourceError } from "./errors.js";

const CHANNEL_ID = /^UC[0-9A-Za-z_-]{22}$/;
const HANDLE = /^@?[\w.-]{3,30}$/;

export function youtubeFeedUrl(channelId: string) {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

/** what someone typed → the YouTube page that names the channel, or null when it isn't a YouTube thing */
export function youtubeLookupUrl(input: string): string | null {
  const typed = input.trim();
  if (HANDLE.test(typed)) return `https://www.youtube.com/${typed.startsWith("@") ? typed : `@${typed}`}`;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(typed) ? typed : `https://${typed}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return id ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` : null;
  }
  if (host !== "youtube.com") return null;
  if (!/^\/(@[\w.-]+|channel\/UC[\w-]{22}|c\/[\w.-]+|user\/[\w.-]+|watch|shorts\/[\w-]+|live\/[\w-]+)(\/.*)?$/.test(url.pathname)) return null;
  return `https://www.youtube.com${url.pathname}${url.pathname === "/watch" ? url.search : ""}`;
}

/** the UC… id from a channel or video page; the video's own channel is named in a meta tag before anything else */
export function extractChannelId(html: string): string | null {
  const match =
    html.match(/<meta itemprop="channelId" content="(UC[0-9A-Za-z_-]{22})"/) ??
    html.match(/<meta itemprop="identifier" content="(UC[0-9A-Za-z_-]{22})"/) ??
    html.match(/"externalId":"(UC[0-9A-Za-z_-]{22})"/) ??
    html.match(/"channelId":"(UC[0-9A-Za-z_-]{22})"/) ??
    html.match(/youtube\.com\/channel\/(UC[0-9A-Za-z_-]{22})/);
  return match?.[1] ?? null;
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function extractChannelTitle(html: string): string | null {
  const match = html.match(/<meta property="og:title" content="([^"]{1,200})"/) ?? html.match(/<title>([^<]{1,200})<\/title>/);
  const title = match?.[1] ? decodeEntities(match[1]).replace(/\s*-\s*YouTube\s*$/, "").trim() : "";
  return title || null;
}

/** a handle, link or id → the channel id (plus the page title when a page had to be read) */
export async function resolveYouTubeChannel(input: string): Promise<{ channelId: string; title: string | null }> {
  const typed = input.trim();
  if (CHANNEL_ID.test(typed)) return { channelId: typed, title: null };
  const direct = typed.match(/youtube\.com\/channel\/(UC[0-9A-Za-z_-]{22})/);
  if (direct?.[1]) return { channelId: direct[1], title: null };
  const page = youtubeLookupUrl(typed);
  if (!page) throw new SourceError("That doesn't look like a YouTube channel: use an @handle, a channel link or a UC… id.");
  const html = await fetchText(page, {
    timeoutMs: 12_000,
    maxBytes: 3_000_000,
    // the consent cookies skip the EU interstitial, which has no channel id on it
    headers: { cookie: "CONSENT=YES+1; SOCS=CAI", "accept-language": "en" },
  });
  const channelId = extractChannelId(html);
  if (!channelId) throw new SourceError("YouTube showed that page, but it doesn't name a channel. Try the channel's @handle.");
  return { channelId, title: extractChannelTitle(html) };
}
