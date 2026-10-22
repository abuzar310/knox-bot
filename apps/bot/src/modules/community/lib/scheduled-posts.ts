// Recurring posts: the job tick sends what is due and books the next run first, so a slow send can't double post.
import { and, eq, lte } from "drizzle-orm";
import { scheduledPosts } from "@knox/db";
import type { KnoxClient } from "../../../client.js";
import { logger } from "../../../logger.js";
import { nextRun, type Repeat } from "../../../lib/schedule.js";

export type ScheduledPost = typeof scheduledPosts.$inferSelect;

export function renderScheduled(content: string, guild: { name: string; memberCount: number }) {
  return content.replace(/\{server\}/g, guild.name).replace(/\{membercount\}/g, String(guild.memberCount)).slice(0, 2000);
}

export async function runScheduledPosts(client: KnoxClient) {
  const now = new Date();
  const due = await client.db.select().from(scheduledPosts).where(lte(scheduledPosts.nextRunAt, now)).limit(50);
  for (const row of due) {
    const next = nextRun({ repeat: row.repeat as Repeat, atUtc: row.atUtc, weekday: row.weekday }, now);
    const claimed = await client.db
      .update(scheduledPosts)
      .set({ nextRunAt: next, lastRunAt: now })
      .where(and(eq(scheduledPosts.id, row.id), eq(scheduledPosts.nextRunAt, row.nextRunAt)))
      .returning({ id: scheduledPosts.id });
    if (!claimed.length) continue;
    const guild = client.guilds.cache.get(row.guildId);
    if (!guild) continue;
    const cached = await client.guildConfig.get(guild.id);
    if (!cached.settings.moduleFlags.community) continue;
    const channel = await guild.channels.fetch(row.channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) continue;
    // scheduled posts are written by admins, so their pings are meant
    await channel
      .send({ content: renderScheduled(row.content, guild), allowedMentions: { parse: ["everyone", "roles", "users"] } })
      .catch((err) => logger.debug({ err, post: row.id }, "scheduled post failed"));
  }
}
