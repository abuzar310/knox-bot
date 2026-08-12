import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger.js";

const require = createRequire(import.meta.url);
const ytdl = require("youtube-dl-exec") as {
  (url: string, flags?: Record<string, unknown>): Promise<unknown>;
  constants: { YOUTUBE_DL_PATH: string };
};

let installing: Promise<void> | null = null;

function downloadUrl() {
  const file = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  return `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${file}`;
}

async function installYtDlp() {
  const dest = ytdl.constants.YOUTUBE_DL_PATH;
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  logger.info("downloading yt-dlp binary");
  const res = await fetch(downloadUrl(), { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`yt-dlp download failed: ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  try {
    fs.chmodSync(dest, 0o755);
  } catch {
    /* Windows */
  }
  logger.info({ bytes: buf.length }, "yt-dlp binary ready");
}

export function ensureYtDlp() {
  if (!installing) installing = installYtDlp();
  return installing;
}

export async function refreshYtDlp() {
  try {
    await ensureYtDlp();
  } catch (error) {
    logger.warn({ err: error }, "yt-dlp install failed");
  }
}

function firstHttpUrl(value: unknown): string | null {
  const text = String(value ?? "");
  const line = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s))
    .at(-1);
  return line ?? null;
}

export async function resolveYoutubeAudioUrl(videoUrl: string, cookiesFile?: string) {
  await ensureYtDlp();
  const flags: Record<string, unknown> = {
    getUrl: true,
    format: "bestaudio[ext=m4a]/bestaudio/best",
    noWarnings: true,
    noCheckCertificates: true,
    noPlaylist: true,
    skipDownload: true,
  };
  if (cookiesFile) {
    flags.cookies = cookiesFile;
    flags.extractorArgs = "youtube:player_client=web,default";
  }

  const raw = await ytdl(videoUrl, flags);
  const url = firstHttpUrl(raw);
  if (!url) {
    throw new Error("yt-dlp did not return an audio URL");
  }
  return url;
}
