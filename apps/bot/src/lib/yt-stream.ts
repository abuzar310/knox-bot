import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger.js";
import { loadYoutubeAuth } from "./youtube-cookies.js";

const botRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const binaryPath = path.join(botRoot, "bin", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
process.env.YOUTUBE_DL_DIR = path.dirname(binaryPath);
process.env.YOUTUBE_DL_FILENAME = path.basename(binaryPath);

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const ytdlExec = require("youtube-dl-exec") as {
  create: (binaryPath: string) => (url: string, flags?: Record<string, unknown>) => Promise<unknown>;
};
const ytdl = ytdlExec.create(binaryPath);

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
  const dest = binaryPath;
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
    logger.info({ bytes: fs.statSync(dest).size }, "yt-dlp binary ready");
    return;
  }
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

const ffmpegPath = require("ffmpeg-static") as string | null;
if (ffmpegPath) {
  process.env.FFMPEG_PATH = ffmpegPath;
}

export function ytDlpOptions(extra: Record<string, unknown> = {}, youtube = true) {
  const auth = loadYoutubeAuth();
  const options: Record<string, unknown> = {
    noCheckCertificates: true,
    noWarnings: true,
    retries: 3,
    fragmentRetries: 3,
    jsRuntimes: `node:${process.execPath}`,
    addHeader: [
      "referer:youtube.com",
      "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ],
    ...(ffmpegPath ? { ffmpegLocation: ffmpegPath } : {}),
    ...extra,
  };
  if (!youtube) return options;
  if (auth.cookiesFile) {
    options.cookies = auth.cookiesFile;
    if (!options.extractorArgs) {
      options.extractorArgs = "youtube:player_client=web,mweb,tv";
    }
  } else if (!options.extractorArgs) {
    options.extractorArgs = "youtube:player_client=android_vr,tv_simply,ios,mweb,web";
  }
  return options;
}

export async function runYtDlp(url: string, extra: Record<string, unknown> = {}, youtube = true) {
  await ensureYtDlp();
  return ytdl(url, ytDlpOptions(extra, youtube));
}

export function parseYtJson(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  const text = String(raw ?? "").trim();
  const start = text.indexOf("{");
  if (start < 0) throw new Error("yt-dlp returned no JSON");
  return JSON.parse(text.slice(start)) as Record<string, unknown>;
}

function firstHttpUrl(value: unknown): string | null {
  if (value && typeof value === "object" && "url" in value && typeof value.url === "string") {
    return value.url;
  }
  const text = String(value ?? "");
  const line = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s))
    .at(-1);
  return line ?? null;
}

export async function resolveYoutubeAudioUrl(videoUrl: string) {
  const started = Date.now();
  await ensureYtDlp();
  const info = await ytdl(
    videoUrl,
    ytDlpOptions({
      dumpSingleJson: true,
      format: "bestaudio/best",
      skipDownload: true,
    }),
  );
  const url = firstHttpUrl(info);
  if (!url) {
    throw new Error("yt-dlp did not return an audio URL");
  }
  logger.info({ ms: Date.now() - started }, "yt-dlp audio url ready");
  return url;
}

export async function resolveYoutubeSearchUrl(query: string) {
  await ensureYtDlp();
  const raw = await ytdl(
    `ytsearch1:${query}`,
    ytDlpOptions({
      dumpSingleJson: true,
      flatPlaylist: true,
      skipDownload: true,
    }),
  );
  const parsed = typeof raw === "string" ? (JSON.parse(raw) as Record<string, unknown>) : (raw as Record<string, unknown>);
  const entries = Array.isArray(parsed?.entries) ? parsed.entries : [parsed];
  const entry = entries[0] as { webpage_url?: string; url?: string; id?: string } | undefined;
  const url =
    entry?.webpage_url ||
    (entry?.url && /^https?:\/\//.test(entry.url) ? entry.url : null) ||
    (entry?.id ? `https://www.youtube.com/watch?v=${entry.id}` : null);
  if (!url) {
    throw new Error("yt-dlp search returned no video");
  }
  return url;
}
