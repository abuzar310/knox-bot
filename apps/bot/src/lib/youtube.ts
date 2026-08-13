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
  const raw = await runYtDlp(`ytsearch${Math.max(1, Math.min(limit, 10))}:${query}`, {
    dumpSingleJson: true,
    flatPlaylist: true,
    skipDownload: true,
  });
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

export async function downloadTrackAudio(url: string, youtube = true) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const dest = cachePathFor(url);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return dest;
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  await runYtDlp(
    url,
    {
      output: dest,
      format: "bestaudio/best",
      preferFreeFormats: true,
      extractAudio: true,
      audioFormat: "opus",
      postprocessorArgs: { ffmpeg: ["-c:a", "libopus", "-b:a", "128k"] },
    },
    youtube,
  );
  const found = resolveDownloadedFile(dest);
  if (!found) throw new Error("Downloaded file is empty");
  return found;
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
    const embed = await spotifyOembed(query);
    const title = embed?.title?.replace(/\s+·\s+/g, " ") || query;
    const results = await youtubeSearch(title, 1);
    return {
      tracks: withRequester(
        results.map((track) => ({
          ...track,
          platform: "spotify" as const,
          thumbnail: embed?.thumbnail_url || track.thumbnail,
        })),
      ),
    };
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
  return { tracks: withRequester(await youtubeSearch(query, 1)) };
}
