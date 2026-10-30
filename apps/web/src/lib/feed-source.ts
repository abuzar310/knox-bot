export const DASHBOARD_FEED_KINDS = ["youtube", "rss", "twitch", "kick", "bluesky"] as const;
export type DashboardFeedKind = (typeof DASHBOARD_FEED_KINDS)[number];

const YT_CHANNEL = /^UC[0-9A-Za-z_-]{22}$/;
const TWITCH_LOGIN = /^[a-z0-9_]{3,25}$/i;
const KICK_SLUG = /^[a-z0-9_-]{3,25}$/i;
const BSKY_HANDLE = /^[a-z0-9][a-z0-9.-]{1,252}\.[a-z]{2,}$/i;

export const MAX_DASHBOARD_FEEDS = 15;

export function parseFeedKind(raw: string): DashboardFeedKind {
  const kind = raw.trim().toLowerCase();
  if ((DASHBOARD_FEED_KINDS as readonly string[]).includes(kind)) return kind as DashboardFeedKind;
  throw new Error("Kind must be youtube, rss, twitch, kick, or bluesky");
}

/** Turn a pasted handle, link, or id into the source `/feed` stores. No live lookup. */
export function parseFeedSource(kind: DashboardFeedKind, input: string): { source: string; label: string } {
  const typed = input.trim();
  if (!typed) throw new Error("Source is required");
  switch (kind) {
    case "youtube": {
      const fromQuery = typed.match(/[?&]channel_id=(UC[0-9A-Za-z_-]{22})/i);
      const fromPath = typed.match(/youtube\.com\/channel\/(UC[0-9A-Za-z_-]{22})/i);
      const id = fromQuery?.[1] ?? fromPath?.[1] ?? (YT_CHANNEL.test(typed) ? typed : null);
      if (!id) {
        throw new Error("YouTube needs a UC… channel id or a youtube.com/channel/UC… link. Handles work from /feed add in Discord.");
      }
      return { source: id, label: id };
    }
    case "rss": {
      let url: URL;
      try {
        url = new URL(typed);
      } catch {
        throw new Error("Paste the full https feed URL");
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Feed URL must start with https://");
      return { source: url.toString(), label: url.hostname };
    }
    case "twitch": {
      const login = typed.replace(/^https?:\/\/(www\.|m\.)?twitch\.tv\//i, "").replace(/^@/, "").split(/[/?#\s]/)[0] ?? "";
      if (!TWITCH_LOGIN.test(login)) throw new Error("That isn't a Twitch username");
      return { source: login.toLowerCase(), label: login };
    }
    case "kick": {
      const slug = typed.replace(/^https?:\/\/(www\.)?kick\.com\//i, "").replace(/^@/, "").split(/[/?#\s]/)[0] ?? "";
      if (!KICK_SLUG.test(slug)) throw new Error("That isn't a Kick username");
      return { source: slug.toLowerCase(), label: slug };
    }
    case "bluesky": {
      let actor = typed.replace(/^@/, "");
      const link = actor.match(/^https?:\/\/(?:www\.)?bsky\.app\/profile\/([^/?#\s]+)/i);
      if (link?.[1]) actor = link[1];
      if (/^did:plc:[a-z0-9]+$/i.test(actor)) return { source: actor, label: actor };
      if (BSKY_HANDLE.test(actor)) return { source: actor.toLowerCase(), label: actor };
      if (/^[a-z0-9-]{3,20}$/i.test(actor)) return { source: `${actor.toLowerCase()}.bsky.social`, label: actor };
      throw new Error("That isn't a Bluesky handle");
    }
    default:
      throw new Error("Unknown feed kind");
  }
}
