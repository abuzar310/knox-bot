// Server activity: messages, joins, leaves and voice minutes are counted in memory and flushed to per-day rows every
// job tick (one upsert per table), so a busy server costs a handful of writes a minute, not one per message.
import { and, desc, eq, gte, lt, sql, sum } from "drizzle-orm";
import { channelDailyMessages, guildDailyStats, memberDailyMessages } from "@knox/db";
import type { KnoxClient } from "../client.js";
import { logger } from "../logger.js";

export type GuildCounters = { messages: number; joins: number; leaves: number; voiceMinutes: number };
export type StatsBuffer = { guild: Map<string, GuildCounters>; members: Map<string, number>; channels: Map<string, number> };

export const RETENTION_DAYS = 90;

export function emptyStatsBuffer(): StatsBuffer {
  return { guild: new Map(), members: new Map(), channels: new Map() };
}

export function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** the day `days` ago, as a key, for "since" filters */
export function dayKeyAgo(days: number, from = new Date()) {
  return dayKey(new Date(from.getTime() - days * 86_400_000));
}

function guildCounters(client: KnoxClient, guildId: string): GuildCounters {
  const key = `${guildId}|${dayKey()}`;
  const existing = client.statsBuffer.guild.get(key);
  if (existing) return existing;
  const fresh: GuildCounters = { messages: 0, joins: 0, leaves: 0, voiceMinutes: 0 };
  client.statsBuffer.guild.set(key, fresh);
  return fresh;
}

export function bumpMessage(client: KnoxClient, guildId: string, userId: string, channelId: string) {
  guildCounters(client, guildId).messages++;
  const day = dayKey();
  const memberKey = `${guildId}|${day}|${userId}`;
  client.statsBuffer.members.set(memberKey, (client.statsBuffer.members.get(memberKey) ?? 0) + 1);
  const channelKey = `${guildId}|${day}|${channelId}`;
  client.statsBuffer.channels.set(channelKey, (client.statsBuffer.channels.get(channelKey) ?? 0) + 1);
}

export function bumpJoin(client: KnoxClient, guildId: string) {
  guildCounters(client, guildId).joins++;
}

export function bumpLeave(client: KnoxClient, guildId: string) {
  guildCounters(client, guildId).leaves++;
}

export function bumpVoiceMinute(client: KnoxClient, guildId: string) {
  guildCounters(client, guildId).voiceMinutes++;
}

/** writes everything counted since the last flush; the buffer is swapped first so counting never waits on the db */
export async function flushStats(client: KnoxClient) {
  const buffer = client.statsBuffer;
  if (!buffer.guild.size && !buffer.members.size && !buffer.channels.size) return;
  client.statsBuffer = emptyStatsBuffer();
  try {
    const guildRows = [...buffer.guild.entries()].map(([key, c]) => {
      const [guildId, day] = key.split("|") as [string, string];
      return { guildId, day, ...c };
    });
    if (guildRows.length) {
      await client.db
        .insert(guildDailyStats)
        .values(guildRows)
        .onConflictDoUpdate({
          target: [guildDailyStats.guildId, guildDailyStats.day],
          set: {
            messages: sql`${guildDailyStats.messages} + excluded.messages`,
            joins: sql`${guildDailyStats.joins} + excluded.joins`,
            leaves: sql`${guildDailyStats.leaves} + excluded.leaves`,
            voiceMinutes: sql`${guildDailyStats.voiceMinutes} + excluded.voice_minutes`,
          },
        });
    }
    const memberRows = [...buffer.members.entries()].map(([key, messages]) => {
      const [guildId, day, userId] = key.split("|") as [string, string, string];
      return { guildId, day, userId, messages };
    });
    if (memberRows.length) {
      await client.db
        .insert(memberDailyMessages)
        .values(memberRows)
        .onConflictDoUpdate({
          target: [memberDailyMessages.guildId, memberDailyMessages.day, memberDailyMessages.userId],
          set: { messages: sql`${memberDailyMessages.messages} + excluded.messages` },
        });
    }
    const channelRows = [...buffer.channels.entries()].map(([key, messages]) => {
      const [guildId, day, channelId] = key.split("|") as [string, string, string];
      return { guildId, day, channelId, messages };
    });
    if (channelRows.length) {
      await client.db
        .insert(channelDailyMessages)
        .values(channelRows)
        .onConflictDoUpdate({
          target: [channelDailyMessages.guildId, channelDailyMessages.day, channelDailyMessages.channelId],
          set: { messages: sql`${channelDailyMessages.messages} + excluded.messages` },
        });
    }
  } catch (err) {
    // the counts in this flush are lost rather than retried: stats are approximate by nature
    logger.warn({ err }, "stats flush failed");
  }
}

export type StatsSummary = {
  days: number;
  messages: number;
  joins: number;
  leaves: number;
  voiceMinutes: number;
  topMembers: Array<{ userId: string; messages: number }>;
  topChannels: Array<{ channelId: string; messages: number }>;
};

export async function statsSummary(client: KnoxClient, guildId: string, days: number): Promise<StatsSummary> {
  const since = dayKeyAgo(days - 1);
  const [totals] = await client.db
    .select({
      messages: sum(guildDailyStats.messages),
      joins: sum(guildDailyStats.joins),
      leaves: sum(guildDailyStats.leaves),
      voiceMinutes: sum(guildDailyStats.voiceMinutes),
    })
    .from(guildDailyStats)
    .where(and(eq(guildDailyStats.guildId, guildId), gte(guildDailyStats.day, since)));
  const topMembers = await client.db
    .select({ userId: memberDailyMessages.userId, messages: sum(memberDailyMessages.messages) })
    .from(memberDailyMessages)
    .where(and(eq(memberDailyMessages.guildId, guildId), gte(memberDailyMessages.day, since)))
    .groupBy(memberDailyMessages.userId)
    .orderBy(desc(sum(memberDailyMessages.messages)))
    .limit(5);
  const topChannels = await client.db
    .select({ channelId: channelDailyMessages.channelId, messages: sum(channelDailyMessages.messages) })
    .from(channelDailyMessages)
    .where(and(eq(channelDailyMessages.guildId, guildId), gte(channelDailyMessages.day, since)))
    .groupBy(channelDailyMessages.channelId)
    .orderBy(desc(sum(channelDailyMessages.messages)))
    .limit(5);
  const n = (value: string | number | null | undefined) => Number(value ?? 0);
  return {
    days,
    messages: n(totals?.messages),
    joins: n(totals?.joins),
    leaves: n(totals?.leaves),
    voiceMinutes: n(totals?.voiceMinutes),
    topMembers: topMembers.map((r) => ({ userId: r.userId, messages: n(r.messages) })),
    topChannels: topChannels.map((r) => ({ channelId: r.channelId, messages: n(r.messages) })),
  };
}

/** rows older than the retention window go */
export async function pruneStats(client: KnoxClient) {
  const cutoff = dayKeyAgo(RETENTION_DAYS);
  await client.db.delete(guildDailyStats).where(lt(guildDailyStats.day, cutoff));
  await client.db.delete(memberDailyMessages).where(lt(memberDailyMessages.day, cutoff));
  await client.db.delete(channelDailyMessages).where(lt(channelDailyMessages.day, cutoff));
}

export function formatHours(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${hours >= 10 ? Math.round(hours) : Math.round(hours * 10) / 10} h`;
}
