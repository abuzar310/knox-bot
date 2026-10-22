import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseYtJson, runYtDlp } from "./yt-stream.js";

const CACHE_DIR = path.join(os.tmpdir(), "knox-audio");
const MAX_PLAYLIST = 50;

export type KnoxTrack = {
  title: string;
  artist: string;
  url: string;
  duration: number;
  thumbnail?: string;
  platform: "youtube" | "spotify" | "soundcloud" | "direct";
  requestedBy?: string;
  youtubeUrl?: string;
  query?: string;
};

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function trackFromEntry(entry: Record<string, unknown>, fallbackUrl?: string): KnoxTrack | null {
  const id = asString(entry.id);
  const url =
    asString(entry.webpage_url) ||
    (asString(entry.url)?.startsWith("http") ? asString(entry.url) : null) ||
    (id ? `https://www.youtube.com/watch?v=${id}` : null) ||
    fallbackUrl ||
    null;
  if (!url) return null;
  const thumbnails = Array.isArray(entry.thumbnails) ? entry.thumbnails : [];
  const thumbObj = thumbnails.at(-1) as { url?: string } | undefined;
  return {
    title: asString(entry.title) || asString(entry.fulltitle) || "Unknown Title",
    artist: asString(entry.uploader) || asString(entry.channel) || "Unknown Artist",
    url,
    duration: asNumber(entry.duration),
    thumbnail:
      asString(entry.thumbnail) || asString(thumbObj?.url) || (id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined),
    platform: "youtube",
  };
}

export function isYouTubeURL(url: string) {
  return /https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url);
}

export function isYouTubePlaylist(url: string) {
  return isYouTubeURL(url) && /[?&]list=/.test(url);
}

export function isSpotifyURL(url: string) {
  return /open\.spotify\.com\/(track|album|playlist|artist)\//i.test(url) || /^spotify:(track|album|playlist|artist):/.test(url);
}

export function isSoundCloudURL(url: string) {
  return /https?:\/\/(www\.)?soundcloud\.com\//i.test(url);
}

export function isDirectAudioURL(url: string) {
  return /^https?:\/\//i.test(url) && /\.(mp3|wav|ogg|opus|m4a|flac)(\?|$)/i.test(url);
}

export function cachePathFor(url: string) {
  const hash = crypto.createHash("md5").update(url).digest("hex");
  return path.join(CACHE_DIR, `track_${hash}.opus`);
}

export async function youtubeSearch(query: string, limit = 1): Promise<KnoxTrack[]> {
  if (isYouTubeURL(query) && !isYouTubePlaylist(query)) {
    const info = await youtubeInfo(query);
    return info ? [info] : [];
  }
  const raw = await runYtDlp(
    `ytsearch${Math.max(1, Math.min(limit, 10))}:${query}`,
    {
      dumpSingleJson: true,
      flatPlaylist: true,
      skipDownload: true,
      socketTimeout: 10,
    },
    true,
    12_000,
  );
  const parsed = parseYtJson(raw);
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [parsed];
  const tracks: KnoxTrack[] = [];
  for (const item of entries.slice(0, limit)) {
    if (!item || typeof item !== "object") continue;
    const track = trackFromEntry(item as Record<string, unknown>);
    if (track) tracks.push(track);
  }
  return tracks;
}

export async function youtubeInfo(url: string): Promise<KnoxTrack | null> {
  try {
    const raw = await runYtDlp(
      url,
      {
        dumpSingleJson: true,
        preferFreeFormats: true,
        skipDownload: true,
        noPlaylist: true,
      },
      isYouTubeURL(url),
    );
    return trackFromEntry(parseYtJson(raw), url);
  } catch {
    return null;
  }
}

export async function youtubePlaylist(url: string): Promise<{ title: string; tracks: KnoxTrack[] } | null> {
  try {
    const raw = await runYtDlp(
      url,
      {
        dumpSingleJson: true,
        flatPlaylist: true,
        skipDownload: true,
      },
      true,
    );
    const parsed = parseYtJson(raw);
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    const tracks: KnoxTrack[] = [];
    for (const item of entries.slice(0, MAX_PLAYLIST)) {
      if (!item || typeof item !== "object") continue;
      const track = trackFromEntry(item as Record<string, unknown>);
      if (track) tracks.push(track);
    }
    if (!tracks.length) return null;
    return { title: asString(parsed.title) || "Playlist", tracks };
  } catch {
    return null;
  }
}

export async function youtubeStreamUrl(url: string) {
  const raw = await runYtDlp(
    url,
    {
      dumpSingleJson: true,
      format: "bestaudio/best",
      skipDownload: true,
    },
    isYouTubeURL(url),
  );
  const info = parseYtJson(raw);
  const stream = asString(info.url);
  if (!stream) throw new Error("No stream URL found");
  return {
    url: stream,
    duration: asNumber(info.duration),
    headers: (info.http_headers as Record<string, string> | undefined) ?? {},
  };
}

export async function soundcloudSearch(query: string, limit = 1): Promise<KnoxTrack[]> {
  const raw = await runYtDlp(
    `scsearch${Math.max(1, Math.min(limit, 5))}:${query.replace(/[\r\n"]+/g, " ").trim()}`,
    {
      dumpSingleJson: true,
      flatPlaylist: true,
      skipDownload: true,
      socketTimeout: 10,
    },
    false,
    12_000,
  );
  const parsed = parseYtJson(raw);
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [parsed];
  const tracks: KnoxTrack[] = [];
  for (const item of entries.slice(0, limit)) {
    if (!item || typeof item !== "object") continue;
    const track = trackFromEntry(item as Record<string, unknown>);
    if (track) tracks.push({ ...track, platform: "soundcloud" });
  }
  return tracks;
}

export async function downloadTrackAudio(url: string, youtube = true) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const dest = cachePathFor(url);
  const existing = resolveDownloadedFile(dest);
  if (existing) return existing;
  if (fs.existsSync(dest)) fs.unlinkSync(dest);

  // web/ios/safari often have no formats; android still has progressive 18.
  const attempts: Array<Record<string, unknown>> = youtube
    ? [
        { extractorArgs: "youtube:player_client=android,mweb,android_vr,tv_simply", format: "bestaudio/18/best" },
        { extractorArgs: "youtube:player_client=android", format: "18" },
      ]
    : [{}];

  let lastError: unknown;
  for (const extra of attempts) {
    try {
      await runYtDlp(
        url,
        {
          output: `${dest.replace(/\.opus$/i, "")}.%(ext)s`,
          format: "bestaudio/best",
          noPlaylist: true,
          ...extra,
        },
        youtube,
        90_000,
      );
      const found = resolveDownloadedFile(dest);
      if (found) return found;
    } catch (error) {
      const found = resolveDownloadedFile(dest);
      if (found) return found;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Downloaded file is empty");
}

function resolveDownloadedFile(dest: string) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return dest;
  const dir = path.dirname(dest);
  const base = path.basename(dest, ".opus");
  if (!fs.existsSync(dir)) return null;
  const match = fs.readdirSync(dir).find((name) => name.startsWith(base) && fs.statSync(path.join(dir, name)).size > 1000);
  return match ? path.join(dir, match) : null;
}

export function deleteCachedFile(url: string) {
  const dest = cachePathFor(url);
  try {
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
  } catch {
    /* ignore */
  }
}

async function spotifyOembed(url: string) {
  const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
  if (!res.ok) return null;
  return (await res.json()) as { title?: string; thumbnail_url?: string };
}

export function spotifyResource(url: string): { kind: string; id: string } | null {
  const web = url.match(/open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(track|album|playlist|artist)\/([A-Za-z0-9]+)/i);
  if (web?.[1] && web[2]) return { kind: web[1].toLowerCase(), id: web[2] };
  const uri = url.match(/^spotify:(track|album|playlist|artist):([A-Za-z0-9]+)/i);
  if (uri?.[1] && uri[2]) return { kind: uri[1].toLowerCase(), id: uri[2] };
  return null;
}

function jsonStr(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw;
  }
}

export function parseSpotifyEmbedTracks(html: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const part of html.split("spotify:track:").slice(1)) {
    const titleMatch = part.match(/"title"\s*:\s*"((?:\\.|[^"\\])+)"/) ?? part.match(/"name"\s*:\s*"((?:\\.|[^"\\])+)"/);
    if (!titleMatch) continue;
    const artistMatch = part.match(/"subtitle"\s*:\s*"((?:\\.|[^"\\])+)"/);
    const title = jsonStr(titleMatch[1]).trim();
    const artist = artistMatch ? jsonStr(artistMatch[1]).trim() : "";
    const name = artist ? `${artist} ${title}` : title;
    const key = name.toLowerCase();
    if (key.length < 2 || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= MAX_PLAYLIST) break;
  }
  return names;
}

export function splitPlayNames(query: string): string[] {
  if (isYouTubeURL(query) || isSpotifyURL(query) || isSoundCloudURL(query) || isDirectAudioURL(query)) {
    return [query.trim()];
  }
  const parts = query.split(/\n+|\s*\|\s*|,\s+/).map((part) => part.trim()).filter(Boolean);
  return parts.length >= 2 ? parts.slice(0, 10) : [query.trim()];
}

export async function searchManyNames(names: string[]): Promise<KnoxTrack[]> {
  const tracks: KnoxTrack[] = [];
  for (let i = 0; i < names.length; i += 5) {
    const batch = await Promise.all(names.slice(i, i + 5).map((name) => searchByName(name)));
    for (const found of batch) {
      if (found[0]) tracks.push(found[0]);
    }
  }
  return tracks;
}

async function resolveSpotify(query: string): Promise<{ tracks: KnoxTrack[]; playlistTitle?: string }> {
  const resource = spotifyResource(query);
  const embed = await spotifyOembed(query);
  if (resource && (resource.kind === "playlist" || resource.kind === "album")) {
    try {
      const page = await fetch(`https://open.spotify.com/embed/${resource.kind}/${resource.id}`, {
        headers: { "user-agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (page.ok) {
        const names = parseSpotifyEmbedTracks(await page.text());
        if (names.length) {
          const tracks = await searchManyNames(names.slice(0, 20));
          return {
            tracks: tracks.map((track) => ({
              ...track,
              platform: "spotify",
              thumbnail: embed?.thumbnail_url || track.thumbnail,
            })),
            playlistTitle: embed?.title || "Spotify",
          };
        }
      }
    } catch {
      /* fall back to playlist title search */
    }
  }
  const title = embed?.title?.replace(/\s+·\s+/g, " ") || query;
  const results = await searchByName(title);
  return {
    tracks: results.map((track) => ({
      ...track,
      platform: "spotify" as const,
      thumbnail: embed?.thumbnail_url || track.thumbnail,
    })),
  };
}

export async function resolvePlayQuery(query: string, requestedBy?: string): Promise<{ tracks: KnoxTrack[]; playlistTitle?: string }> {
  const withRequester = (tracks: KnoxTrack[]) =>
    tracks.map((track) => ({ ...track, requestedBy }));

  if (isYouTubePlaylist(query)) {
    const playlist = await youtubePlaylist(query);
    if (!playlist?.tracks.length) return { tracks: [] };
    return { tracks: withRequester(playlist.tracks), playlistTitle: playlist.title };
  }
  if (isYouTubeURL(query)) {
    const info = await youtubeInfo(query);
    return { tracks: withRequester(info ? [info] : []) };
  }
  if (isSpotifyURL(query)) {
    const result = await resolveSpotify(query);
    return { tracks: withRequester(result.tracks), playlistTitle: result.playlistTitle };
  }
  if (isSoundCloudURL(query)) {
    const info = await youtubeInfo(query);
    return {
      tracks: withRequester(
        info ? [{ ...info, platform: "soundcloud", url: query }] : [],
      ),
    };
  }
  if (isDirectAudioURL(query)) {
    return {
      tracks: withRequester([
        {
          title: path.basename(new URL(query).pathname) || "Audio",
          artist: "Direct",
          url: query,
          duration: 0,
          platform: "direct",
        },
      ]),
    };
  }
  const names = splitPlayNames(query);
  if (names.length > 1) {
    const tracks = await searchManyNames(names);
    return { tracks: withRequester(tracks), playlistTitle: `${tracks.length} songs` };
  }
  return { tracks: withRequester(await searchByName(query)) };
}

function aliasQueries(query: string) {
  const words = query.trim().split(/\s+/);
  const folded = foldLatin(words[0] ?? "");
  const alt = (
    {
      vardan: "vardaan",
      vardann: "vardaan",
      kariyat: "khairiyat",
      saki: "saaki",
    } as Record<string, string>
  )[folded];
  if (!alt) return [] as string[];
  return [[alt, ...words.slice(1)].join(" ")];
}

function matchesPrimary(track: { title: string; artist?: string }, query: string) {
  const primary = queryTokens(query)[0];
  if (!primary) return true;
  return titleMatchScore(hitLabel(track), primary) > 0;
}

export async function searchByName(query: string, exclude: string[] = []): Promise<KnoxTrack[]> {
  const blocked = new Set(exclude.filter(Boolean));
  const queries = [query, ...aliasQueries(query)];
  for (const q of queries) {
    try {
      const tracks = await innertubeSearch(q, blocked);
      if (tracks[0] && (matchesPrimary(tracks[0], q) || matchesPrimary(tracks[0], query))) return tracks;
    } catch {
      /* same InnerTube search Distube/JUGNU-style bots use; yt-dlp ytsearch hangs on Render */
    }
  }
  for (const q of queries) {
    try {
      const tracks = (await soundcloudSearch(q, 3)).filter(
        (track) => !blocked.has(track.url) && !isJunkTrack(track, q) && matchesPrimary(track, q),
      );
      if (tracks.length) return tracks.map((track) => ({ ...track, query: q }));
    } catch {
      /* fall through */
    }
  }
  try {
    const tracks = await youtubeSearch(query, 1);
    if (tracks.length && !blocked.has(tracks[0].url) && matchesPrimary(tracks[0], query)) {
      return tracks.map((track) => ({ ...track, query }));
    }
  } catch {
    /* fall through */
  }
  return [];
}

function withoutViews(hit: SearchHit, query: string): KnoxTrack {
  const { views: _views, ...track } = hit;
  return { ...track, query };
}

export async function searchFamousList(query: string, limit = 8): Promise<KnoxTrack[]> {
  try {
    const hits = await innertubeHits(query);
    const full = hits.filter((hit) => !isJunkTrack(hit, query));
    const pool = (full.length ? full : hits.filter((hit) => !isClipTrack(hit))).sort((a, b) => b.views - a.views);
    if (pool.length) return pool.slice(0, limit).map((hit) => withoutViews(hit, query));
  } catch {
    /* fall through */
  }
  return youtubeSearch(query, limit);
}

function runText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const rec = value as { simpleText?: string; runs?: Array<{ text?: string }> };
  if (rec.simpleText) return rec.simpleText;
  return rec.runs?.map((r) => r.text ?? "").join("") ?? "";
}

function clockToSeconds(text: string): number {
  const parts = text.split(":").map((n) => Number(n));
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((sum, n) => sum * 60 + n, 0);
}

export function parseViewCount(text: string): number {
  const match = text.replace(/,/g, "").trim().toLowerCase().match(/([\d.]+)\s*([kmb])?/);
  if (!match) return 0;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * (match[2] === "b" ? 1e9 : match[2] === "m" ? 1e6 : match[2] === "k" ? 1e3 : 1));
}

export function isClipTrack(track: { title: string; duration: number }): boolean {
  if (track.duration > 0 && track.duration < 90) return true;
  return /#shorts|\bshort\b|\bsped up\b|\bnightcore\b|\b8d audio\b/i.test(track.title);
}

export function isMashupTrack(track: { title: string; duration: number }, query = ""): boolean {
  if (/\b(mashup|medley|jukebox|compilation|mix|album)\b/i.test(query)) return false;
  if (track.duration > 15 * 60) return true;
  return /\bmashup\b|\bmedley\b|\bjukebox\b|\bcompilation\b|\bnon[ -]?stop\b|\bfull album\b|\b1\s*hour\b|\blofi mix\b|\bsongs? mix\b/i.test(
    track.title,
  );
}

export function isJunkTrack(track: { title: string; duration: number }, query = ""): boolean {
  return isClipTrack(track) || isMashupTrack(track, query);
}

const QUERY_STOP = new Set([
  "the",
  "and",
  "for",
  "from",
  "with",
  "official",
  "video",
  "lyrics",
  "full",
  "song",
  "by",
  "feat",
]);

function foldLatin(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/aa/g, "a")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/([bcdghkpt])h/g, "$1")
    .replace(/(.)\1+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function queryTokens(query: string) {
  return foldLatin(query).split(" ").filter((word) => word.length > 2 && !QUERY_STOP.has(word));
}

function tokenHits(hay: string, token: string) {
  if (hay.includes(token)) return true;
  if (token.length < 5) return false;
  for (let i = 0; i <= token.length - 5; i++) {
    if (hay.includes(token.slice(i, i + 5))) return true;
  }
  return false;
}

export function titleMatchScore(title: string, query: string) {
  const words = queryTokens(query);
  if (!words.length) return 0;
  const text = foldLatin(title);
  return words.filter((word) => tokenHits(text, word)).length;
}

function hitLabel(hit: { title: string; artist?: string }) {
  return `${hit.title} ${hit.artist ?? ""}`;
}

type SearchHit = KnoxTrack & { views: number };

export function pickFamousTrack<T extends { title: string; duration: number; views: number; artist?: string }>(
  hits: T[],
  query = "",
): T | null {
  if (!hits.length) return null;
  const full = hits.filter((hit) => !isJunkTrack(hit, query));
  const pool = full.length ? full : hits.filter((hit) => !isClipTrack(hit));
  const ranked = pool.length ? pool : hits;
  if (!queryTokens(query).length) {
    return ranked.reduce((best, hit) => {
      if (hit.views !== best.views) return hit.views > best.views ? hit : best;
      return hit.duration > best.duration ? hit : best;
    });
  }
  const primary = queryTokens(query)[0];
  const tight = primary ? ranked.filter((hit) => titleMatchScore(hitLabel(hit), primary) > 0) : ranked;
  if (primary && !tight.length) return null;
  const scored = tight.map((hit, index) => ({
    hit,
    index,
    match: titleMatchScore(hitLabel(hit), query),
  }));
  const matched = scored.filter((row) => row.match > 0);
  const use = matched.length ? matched : scored;
  use.sort((a, b) => {
    if (b.match !== a.match) return b.match - a.match;
    if (matched.length && b.hit.views !== a.hit.views) return b.hit.views - a.hit.views;
    return a.index - b.index;
  });
  return use[0]?.hit ?? null;
}

function videoViews(video: Record<string, unknown>): number {
  return (
    parseViewCount(runText(video.viewCountText)) ||
    parseViewCount(runText(video.shortViewCountText)) ||
    asNumber(video.viewCount)
  );
}

export function tracksFromInnertube(data: unknown): SearchHit[] {
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const stack: unknown[] = [data];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    const rec = node as Record<string, unknown>;
    const video = rec.videoRenderer;
    if (video && typeof video === "object") {
      const v = video as Record<string, unknown>;
      const id = asString(v.videoId);
      if (id && !seen.has(id)) {
        seen.add(id);
        hits.push({
          title: runText(v.title) || "Unknown Title",
          artist: runText(v.ownerText) || runText(v.longBylineText) || "YouTube",
          url: `https://www.youtube.com/watch?v=${id}`,
          duration: clockToSeconds(runText(v.lengthText)),
          thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
          platform: "youtube",
          views: videoViews(v),
        });
      }
    }
    for (const val of Object.values(rec)) {
      if (val && typeof val === "object") stack.push(val);
    }
  }
  return hits;
}

export function trackFromInnertube(data: unknown): KnoxTrack | null {
  const best = pickFamousTrack(tracksFromInnertube(data));
  if (!best) return null;
  const { views: _views, ...track } = best;
  return track;
}

async function innertubeHits(query: string): Promise<SearchHit[]> {
  const res = await fetch("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0" },
    body: JSON.stringify({
      context: { client: { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "en", gl: "IN" } },
      query,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  return tracksFromInnertube(await res.json());
}

async function innertubeSearch(query: string, blocked = new Set<string>()): Promise<KnoxTrack[]> {
  const hits = (await innertubeHits(query)).filter((hit) => !blocked.has(hit.url));
  const best = pickFamousTrack(hits, query);
  return best ? [withoutViews(best, query)] : [];
}
