import { createRequire } from "node:module";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../logger.js";
import { loadYoutubeAuth } from "./youtube-cookies.js";

const botRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const binaryPath = path.join(botRoot, "bin", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

function flagsToArgs(flags: Record<string, unknown>) {
  const out: string[] = [];
  for (const [key, value] of Object.entries(flags)) {
    if (value === undefined || value === false || value === null) continue;
    const flag = `--${key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`;
    if (value === true) {
      out.push(flag);
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) out.push(flag, String(item));
  }
  return out;
}

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

/**
 * yt-dlp publishes SHA2-256SUMS next to every release: a downloaded binary must match its line, or it is
 * deleted. If the sums file itself can't be fetched, the download is kept with a warning (it was over https).
 */
async function verifyChecksum(url: string, dest: string) {
  const asset = path.basename(new URL(url).pathname);
  let sums: string;
  try {
    const res = await fetch("https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS", {
      redirect: "follow",
      headers: { "user-agent": "knox-bot" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    sums = await res.text();
  } catch (error) {
    logger.warn({ err: error }, "could not fetch yt-dlp checksums; keeping the download unverified");
    return;
  }
  const expected = sums
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .find((parts) => parts[1]?.replace(/^\*/, "") === asset)?.[0];
  if (!expected) {
    logger.warn({ asset }, "yt-dlp checksum list has no entry for this asset; keeping the download unverified");
    return;
  }
  const actual = crypto.createHash("sha256").update(fs.readFileSync(dest)).digest("hex");
  if (actual !== expected.toLowerCase()) {
    fs.rmSync(dest, { force: true });
    throw new Error(`yt-dlp checksum mismatch for ${asset}`);
  }
  logger.info({ asset }, "yt-dlp checksum verified");
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
      await verifyChecksum(url, dest);
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

/** current yt-dlp only enables deno unless told otherwise; Node solves YouTube's JS challenge */
export function youtubeJsArgs() {
  return ["--js-runtimes", `node:${process.execPath}`];
}

export function ytDlpOptions(extra: Record<string, unknown> = {}, youtube = true) {
  const auth = loadYoutubeAuth();
  const options: Record<string, unknown> = {
    noWarnings: true,
    retries: 1,
    fragmentRetries: 1,
    addHeader: ["referer:https://www.youtube.com/", "origin:https://www.youtube.com"],
    ...(ffmpegPath ? { ffmpegLocation: ffmpegPath } : {}),
    ...extra,
  };
  if (!youtube) return options;
  if (auth.cookiesFile) options.cookies = auth.cookiesFile;
  return options;
}

export async function runYtDlp(
  url: string,
  extra: Record<string, unknown> = {},
  youtube = true,
  timeoutMs = 40_000,
) {
  await ensureYtDlp();
  // ponytail: youtube-dl-exec uses cmd.exe on Windows, so paths with spaces
  // (D:\zaru verce\...) and Hindi titles get split into extra commands.
  try {
    const flags = flagsToArgs(ytDlpOptions(extra, youtube));
    const args = [...(youtube ? youtubeJsArgs() : []), ...flags, url];
    const { stdout } = await execFileAsync(binaryPath, args, {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
    });
    const text = String(stdout ?? "").trim();
    return text.startsWith("{") ? JSON.parse(text) : stdout;
  } catch (error) {
    const err = error as { killed?: boolean; stderr?: string; stdout?: string; message?: string };
    if (err.killed && process.platform === "win32") {
      execFile("taskkill", ["/IM", "yt-dlp.exe", "/F"], () => undefined);
    }
    throw new Error((err.stderr || err.stdout || err.message || "yt-dlp failed").toString().slice(-2000));
  }
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

