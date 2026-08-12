import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger.js";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const ytdl = require("youtube-dl-exec") as {
  (url: string, flags?: Record<string, unknown>): Promise<unknown>;
  constants: { YOUTUBE_DL_PATH: string };
};

let installing: Promise<void> | null = null;

function downloadUrls() {
  if (process.platform === "win32") {
    return ["https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"];
  }
  return [
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux",
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp",
  ];
}

async function curlToFile(url: string, dest: string) {
  await execFileAsync("curl", ["-fsSL", "--retry", "3", "--retry-delay", "2", "-A", "knox-bot", "-o", dest, url], {
    timeout: 120_000,
  });
}

async function fetchToFile(url: string, dest: string) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "knox-bot" },
  });
  if (!res.ok) throw new Error(`yt-dlp download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

async function installYtDlp() {
  const dest = ytdl.constants.YOUTUBE_DL_PATH;
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  logger.info("downloading yt-dlp binary");
  let lastError: unknown;
  for (const url of downloadUrls()) {
    try {
      try {
        await curlToFile(url, dest);
      } catch {
        await fetchToFile(url, dest);
      }
      if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) {
        throw new Error("yt-dlp download was empty");
      }
      try {
        fs.chmodSync(dest, 0o755);
      } catch {
        /* Windows */
      }
      logger.info({ bytes: fs.statSync(dest).size }, "yt-dlp binary ready");
      return;
    } catch (error) {
      lastError = error;
      logger.warn({ err: error, url }, "yt-dlp download attempt failed");
    }
  }
  throw lastError instanceof Error ? lastError : new Error("yt-dlp download failed");
}

export function ensureYtDlp() {
  if (!installing) {
    installing = installYtDlp().catch((error) => {
      installing = null;
      throw error;
    });
  }
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
