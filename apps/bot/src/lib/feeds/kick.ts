// Kick's public API (free developer app): an app token, then channel lookups by slug say who is live.
import { fetchJson, retryOnUnauthorized } from "./http.js";

/** Kick's channels endpoint refuses slugs longer than 25 characters with a bare "Invalid request" */
export const KICK_SLUG = /^[a-z0-9_-]{3,25}$/i;

export type KickChannel = {
  broadcaster_user_id?: number;
  slug: string;
  stream_title?: string | null;
  category?: { name?: string | null } | null;
  stream?: {
    is_live?: boolean;
    start_time?: string | null;
    viewer_count?: number;
    thumbnail?: string | null;
  } | null;
};

let token: { value: string; expiresAt: number } | null = null;

export function kickConfigured() {
  return Boolean(process.env.KICK_CLIENT_ID && process.env.KICK_CLIENT_SECRET);
}

async function appToken(fresh = false): Promise<string> {
  if (!fresh && token && token.expiresAt > Date.now() + 60_000) return token.value;
  const res = await fetchJson<{ access_token: string; expires_in?: number }>("https://id.kick.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.KICK_CLIENT_ID ?? "",
      client_secret: process.env.KICK_CLIENT_SECRET ?? "",
    }).toString(),
  });
  token = { value: res.access_token, expiresAt: Date.now() + (res.expires_in ?? 3600) * 1000 };
  return token.value;
}

/** a name, @name or kick.com link → the slug, or null when it can't be one */
export function kickSlugFrom(input: string): string | null {
  const slug =
    input
      .trim()
      .replace(/^https?:\/\/(www\.)?kick\.com\//i, "")
      .replace(/^@/, "")
      .split(/[/?#\s]/)[0] ?? "";
  return KICK_SLUG.test(slug) ? slug.toLowerCase() : null;
}

/** these channels' current state, keyed by lower-case slug (the API takes 50 per request) */
export async function kickChannels(slugs: string[]): Promise<Map<string, KickChannel>> {
  const out = new Map<string, KickChannel>();
  for (let i = 0; i < slugs.length; i += 50) {
    const params = new URLSearchParams();
    for (const slug of slugs.slice(i, i + 50)) params.append("slug", slug.toLowerCase());
    const res = await retryOnUnauthorized(async (fresh) =>
      fetchJson<{ data?: KickChannel[] }>(`https://api.kick.com/public/v1/channels?${params}`, {
        headers: { authorization: `Bearer ${await appToken(fresh)}` },
      }),
    );
    for (const channel of res.data ?? []) {
      if (channel?.slug) out.set(channel.slug.toLowerCase(), channel);
    }
  }
  return out;
}

export function kickUrl(slug: string) {
  return `https://kick.com/${slug}`;
}
