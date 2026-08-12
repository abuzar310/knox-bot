import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type BrowserCookie = {
  domain?: string;
  path?: string;
  secure?: boolean;
  expirationDate?: number;
  name: string;
  value: string;
};

export type YoutubeAuth = {
  header?: string;
  cookiesFile?: string;
};

function asCookieList(raw: string): BrowserCookie[] | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (item): item is BrowserCookie =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as BrowserCookie).name === "string" &&
        typeof (item as BrowserCookie).value === "string",
    );
  } catch {
    return null;
  }
}

export function loadYoutubeAuth(): YoutubeAuth {
  const raw = process.env.YOUTUBE_COOKIES_JSON ?? process.env.YOUTUBE_COOKIE;
  if (!raw?.trim()) return {};

  const list = asCookieList(raw);
  if (!list?.length) {
    return { header: raw };
  }

  const header = list.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  const cookiesFile = path.join(os.tmpdir(), "knox-youtube-cookies.txt");
  const lines = ["# Netscape HTTP Cookie File"];
  for (const cookie of list) {
    const domain = cookie.domain?.startsWith(".")
      ? cookie.domain
      : `.${cookie.domain ?? "youtube.com"}`;
    lines.push(
      [
        domain,
        "TRUE",
        cookie.path || "/",
        cookie.secure ? "TRUE" : "FALSE",
        String(Math.floor(cookie.expirationDate ?? 0)),
        cookie.name,
        cookie.value,
      ].join("\t"),
    );
  }
  fs.writeFileSync(cookiesFile, `${lines.join("\n")}\n`);
  try {
    fs.chmodSync(cookiesFile, 0o600);
  } catch {
    /* Windows */
  }
  return { header, cookiesFile };
}
