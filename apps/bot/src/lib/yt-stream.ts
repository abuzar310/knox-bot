import { createRequire } from "node:module";
import { logger } from "../logger.js";

const require = createRequire(import.meta.url);
const ytdl = require("youtube-dl-exec") as {
  (url: string, flags?: Record<string, unknown>): Promise<unknown>;
  update?: (binaryPath?: string) => Promise<unknown>;
};

function firstHttpUrl(value: unknown): string | null {
  const text = String(value ?? "");
  const line = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s))
    .at(-1);
  return line ?? null;
}

export async function refreshYtDlp() {
  if (typeof ytdl.update !== "function") return;
  try {
    await ytdl.update();
    logger.info("yt-dlp binary updated");
  } catch (error) {
    logger.warn({ err: error }, "yt-dlp update skipped");
  }
}

export async function resolveYoutubeAudioUrl(videoUrl: string, cookiesFile?: string) {
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
