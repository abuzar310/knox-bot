// Twitch's Helix API (free developer app): an app token, then "who among these logins is streaming right now".
import { fetchJson, retryOnUnauthorized } from "./http.js";

export const TWITCH_LOGIN = /^[a-z0-9_]{3,25}$/i;

export type TwitchUser = { id: string; login: string; display_name: string; profile_image_url?: string };
export type TwitchStream = {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_name: string;
  title: string;
  viewer_count: number;
  started_at: string;
  thumbnail_url: string;
  type: string;
};

let token: { value: string; expiresAt: number } | null = null;

export function twitchConfigured() {
  return Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
}

async function appToken(fresh = false): Promise<string> {
  if (!fresh && token && token.expiresAt > Date.now() + 60_000) return token.value;
  const res = await fetchJson<{ access_token: string; expires_in?: number }>("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.TWITCH_CLIENT_ID ?? "",
      client_secret: process.env.TWITCH_CLIENT_SECRET ?? "",
      grant_type: "client_credentials",
    }).toString(),
  });
  token = { value: res.access_token, expiresAt: Date.now() + (res.expires_in ?? 3600) * 1000 };
  return token.value;
}

async function helix<T>(path: string, params: URLSearchParams): Promise<T[]> {
  const res = await retryOnUnauthorized(async (fresh) =>
    fetchJson<{ data?: T[] }>(`https://api.twitch.tv/helix/${path}?${params}`, {
      headers: { "client-id": process.env.TWITCH_CLIENT_ID ?? "", authorization: `Bearer ${await appToken(fresh)}` },
    }),
  );
  return res.data ?? [];
}

/** a name, @name or twitch.tv link → the login, or null when it can't be one */
export function twitchLoginFrom(input: string): string | null {
  const login =
    input
      .trim()
      .replace(/^https?:\/\/(www\.|m\.)?twitch\.tv\//i, "")
      .replace(/^@/, "")
      .split(/[/?#\s]/)[0] ?? "";
  return TWITCH_LOGIN.test(login) ? login.toLowerCase() : null;
}

export async function twitchUser(login: string): Promise<TwitchUser | null> {
  const [user] = await helix<TwitchUser>("users", new URLSearchParams({ login }));
  return user ?? null;
}

/** the live streams among these logins, keyed by lower-case login (Helix takes 100 per request) */
export async function twitchStreams(logins: string[]): Promise<Map<string, TwitchStream>> {
  const out = new Map<string, TwitchStream>();
  for (let i = 0; i < logins.length; i += 100) {
    const params = new URLSearchParams({ first: "100" });
    for (const login of logins.slice(i, i + 100)) params.append("user_login", login.toLowerCase());
    for (const stream of await helix<TwitchStream>("streams", params)) {
      if (stream.type === "live") out.set(stream.user_login.toLowerCase(), stream);
    }
  }
  return out;
}

/** a 1280x720 preview with a cache-buster per minute, so Discord doesn't keep an old frame */
export function twitchThumbnail(templateUrl: string) {
  return `${templateUrl.replace("{width}", "1280").replace("{height}", "720")}?t=${Math.floor(Date.now() / 60_000)}`;
}
