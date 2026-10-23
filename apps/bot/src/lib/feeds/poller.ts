// Checks every followed creator and feed on a schedule and announces what's new. YouTube and RSS are read as
// feeds (no API key); Twitch and Kick are asked who is live through their public APIs when the host has app
// credentials. Each subscription remembers what it already announced, so a restart never repeats a post.
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { EmbedBuilder } from "discord.js";
import { feedSubscriptions, type FeedKind } from "@knox/db";
import type { KnoxClient } from "../../client.js";
import { logger } from "../../logger.js";
import { logLine } from "../../modules/moderation/lib/modlog.js";
import { fetchText } from "./http.js";
import { parseFeed, type FeedDoc } from "./rss.js";
import { youtubeFeedUrl } from "./youtube.js";
import { fetchBlueskyFeed } from "./bluesky.js";
import { twitchConfigured, twitchStreams, twitchThumbnail } from "./twitch.js";
import { kickChannels, kickConfigured, kickUrl } from "./kick.js";
import { renderAlert, type AlertVars } from "./template.js";

export type FeedSubscription = typeof feedSubscriptions.$inferSelect;

/** how often each kind is checked; streams more often so "live" lands within a couple of minutes */
export const CHECK_INTERVAL_MS: Record<FeedKind, number> = {
  youtube: 5 * 60_000,
  rss: 5 * 60_000,
  twitch: 2 * 60_000,
  kick: 2 * 60_000,
  bluesky: 5 * 60_000,
};
/** at most this many posts per check, so a feed that dumps its archive doesn't flood a channel */
const MAX_POSTS_PER_CHECK = 3;
/** items older than this are remembered but not announced (feeds re-surface old entries) */
const MAX_ITEM_AGE_MS = 3 * 24 * 60 * 60_000;
const SEEN_KEEP = 60;
const PAUSE_AFTER_FAILURES = 20;
const FEED_CONCURRENCY = 4;

export type LiveInfo = {
  /** the stream's id (Twitch) or start time (Kick): a new one means a new broadcast */
  id: string;
  title: string;
  url: string;
  author: string;
  game: string;
  viewers: number;
  startedAt: Date | null;
  thumbnail: string | null;
  color: number;
};

/** the current items of a YouTube channel or an RSS/Atom feed */
export async function fetchFeedDoc(kind: FeedKind, source: string): Promise<FeedDoc> {
  if (kind === "bluesky") return fetchBlueskyFeed(source);
  const url = kind === "youtube" ? youtubeFeedUrl(source) : source;
  const xml = await fetchText(url, { publicOnly: kind === "rss" });
  return parseFeed(xml);
}

/** who is live among these Twitch logins or Kick slugs, keyed by lower-case name */
export async function fetchLive(kind: "twitch" | "kick", names: string[]): Promise<Map<string, LiveInfo>> {
  const out = new Map<string, LiveInfo>();
  if (kind === "twitch") {
    for (const [login, s] of await twitchStreams(names)) {
      out.set(login, {
        id: s.id,
        title: s.title || "Live",
        url: `https://www.twitch.tv/${s.user_login}`,
        author: s.user_name || s.user_login,
        game: s.game_name || "Just Chatting",
        viewers: s.viewer_count ?? 0,
        startedAt: s.started_at ? new Date(s.started_at) : null,
        thumbnail: s.thumbnail_url ? twitchThumbnail(s.thumbnail_url) : null,
        color: 0x9146ff,
      });
    }
    return out;
  }
  for (const [slug, c] of await kickChannels(names)) {
    if (!c.stream?.is_live) continue;
    out.set(slug, {
      id: c.stream.start_time || `${slug}:${new Date().toISOString().slice(0, 13)}`,
      title: c.stream_title || "Live",
      url: kickUrl(c.slug),
      author: c.slug,
      game: c.category?.name || "Just Chatting",
      viewers: c.stream.viewer_count ?? 0,
      startedAt: c.stream.start_time ? new Date(c.stream.start_time) : null,
      thumbnail: c.stream.thumbnail || null,
      color: 0x53fc18,
    });
  }
  return out;
}

export function streamEmbed(info: LiveInfo) {
  const embed = new EmbedBuilder()
    .setColor(info.color)
    .setAuthor({ name: info.author.slice(0, 256) })
    .setTitle(info.title.slice(0, 256))
    .setURL(info.url)
    .addFields(
      { name: "Playing", value: info.game.slice(0, 100), inline: true },
      { name: "Viewers", value: String(info.viewers), inline: true },
    );
  if (info.thumbnail) embed.setImage(info.thumbnail);
  if (info.startedAt) embed.setTimestamp(info.startedAt);
  return embed;
}

/** posts one alert for a subscription; false when the channel is gone or unreadable */
export async function announce(
  client: KnoxClient,
  sub: FeedSubscription,
  vars: Omit<AlertVars, "role" | "server">,
  embed?: EmbedBuilder,
  ping = true,
): Promise<boolean> {
  const guild = client.guilds.cache.get(sub.guildId);
  if (!guild) return false;
  const channel = await guild.channels.fetch(sub.channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return false;
  const roleId = ping ? sub.pingRoleId : null;
  const everyone = roleId === guild.id;
  const role = roleId ? (everyone ? "@everyone" : `<@&${roleId}>`) : "";
  const content = renderAlert(sub.template, sub.kind, { ...vars, role, server: guild.name });
  await channel.send({
    content,
    embeds: embed ? [embed] : [],
    allowedMentions: roleId ? (everyone ? { parse: ["everyone"] } : { roles: [roleId] }) : { parse: [] },
  });
  return true;
}

let polling = false;

/** called every job tick; only subscriptions whose interval has passed are checked */
export async function pollFeeds(client: KnoxClient) {
  if (polling) return;
  polling = true;
  try {
    const shortest = Math.min(...Object.values(CHECK_INTERVAL_MS));
    const candidates = await client.db
      .select()
      .from(feedSubscriptions)
      .where(
        and(
          eq(feedSubscriptions.paused, false),
          or(isNull(feedSubscriptions.lastCheckedAt), lt(feedSubscriptions.lastCheckedAt, new Date(Date.now() - shortest))),
        ),
      );
    const now = Date.now();
    const due: FeedSubscription[] = [];
    for (const sub of candidates) {
      if (sub.lastCheckedAt && now - sub.lastCheckedAt.getTime() < CHECK_INTERVAL_MS[sub.kind]) continue;
      if (!client.guilds.cache.has(sub.guildId)) continue;
      const cached = await client.guildConfig.get(sub.guildId);
      if (!cached.settings.moduleFlags.alerts) continue;
      due.push(sub);
    }
    if (!due.length) return;
    await Promise.all([
      checkFeeds(client, due.filter((s) => s.kind === "youtube" || s.kind === "rss" || s.kind === "bluesky")),
      checkStreams(client, due.filter((s) => s.kind === "twitch"), "twitch"),
      checkStreams(client, due.filter((s) => s.kind === "kick"), "kick"),
    ]);
  } catch (err) {
    logger.warn({ err }, "feed poll failed");
  } finally {
    polling = false;
  }
}

async function checkFeeds(client: KnoxClient, subs: FeedSubscription[]) {
  for (let i = 0; i < subs.length; i += FEED_CONCURRENCY) {
    await Promise.all(subs.slice(i, i + FEED_CONCURRENCY).map((sub) => checkFeed(client, sub)));
  }
}

async function checkFeed(client: KnoxClient, sub: FeedSubscription) {
  try {
    const doc = await fetchFeedDoc(sub.kind, sub.source);
    const seen = new Set(sub.seenIds);
    const fresh = doc.items.filter((item) => !seen.has(item.id));
    // feeds list newest first: remember everything new before posting, so a slow send can't repeat on the next tick
    const nextSeen = [...sub.seenIds, ...fresh.map((item) => item.id).reverse()].slice(-SEEN_KEEP);
    await client.db
      .update(feedSubscriptions)
      .set({ seenIds: nextSeen, lastCheckedAt: new Date(), failures: 0 })
      .where(eq(feedSubscriptions.id, sub.id));
    const recent = fresh.filter((item) => !item.publishedAt || Date.now() - item.publishedAt.getTime() < MAX_ITEM_AGE_MS);
    for (const item of recent.slice(0, MAX_POSTS_PER_CHECK).reverse()) {
      await announce(client, sub, { title: item.title, url: item.url, author: item.author || sub.label, game: "", viewers: "" }).catch(
        (err) => logger.debug({ err, sub: sub.id }, "alert post failed"),
      );
    }
  } catch (err) {
    await recordFailure(client, sub, err);
  }
}

async function checkStreams(client: KnoxClient, subs: FeedSubscription[], kind: "twitch" | "kick") {
  if (!subs.length) return;
  const configured = kind === "twitch" ? twitchConfigured() : kickConfigured();
  if (!configured) {
    // no app credentials on this host: nothing to ask, but don't retry every tick
    await client.db
      .update(feedSubscriptions)
      .set({ lastCheckedAt: new Date() })
      .where(inArray(feedSubscriptions.id, subs.map((s) => s.id)));
    return;
  }
  const names = [...new Set(subs.map((s) => s.source.toLowerCase()))];
  let live: Map<string, LiveInfo>;
  try {
    live = await fetchLive(kind, names);
  } catch (err) {
    for (const sub of subs) await recordFailure(client, sub, err);
    return;
  }
  for (const sub of subs) {
    const info = live.get(sub.source.toLowerCase());
    const announced = info ? sub.seenIds.includes(info.id) : false;
    await client.db
      .update(feedSubscriptions)
      .set({
        live: Boolean(info),
        lastCheckedAt: new Date(),
        failures: 0,
        ...(info && !announced ? { seenIds: [...sub.seenIds, info.id].slice(-SEEN_KEEP) } : {}),
      })
      .where(eq(feedSubscriptions.id, sub.id));
    if (info && !announced) {
      await announce(
        client,
        sub,
        { title: info.title, url: info.url, author: info.author, game: info.game, viewers: String(info.viewers) },
        streamEmbed(info),
      ).catch((err) => logger.debug({ err, sub: sub.id }, "live alert failed"));
    }
  }
}

async function recordFailure(client: KnoxClient, sub: FeedSubscription, err: unknown) {
  const failures = sub.failures + 1;
  const paused = failures >= PAUSE_AFTER_FAILURES;
  await client.db
    .update(feedSubscriptions)
    .set({ failures, paused, lastCheckedAt: new Date() })
    .where(eq(feedSubscriptions.id, sub.id));
  logger.debug({ err, sub: sub.id, kind: sub.kind, failures }, "feed check failed");
  if (!paused) return;
  const guild = client.guilds.cache.get(sub.guildId);
  if (!guild) return;
  const cached = await client.guildConfig.get(guild.id);
  await logLine(
    guild,
    cached.settings,
    "Feed paused",
    `#${sub.id} **${sub.label}** (${sub.kind}) failed ${failures} checks in a row and was paused. Fix the source, then /feed resume number:${sub.id}.`,
    0xff5c5c,
  );
}
