// Sticky notes, auto-threads and DISBOARD bump reminders: the small helpers the events, commands and job tick share.
import { and, eq, lt } from "drizzle-orm";
import type { GuildTextBasedChannel } from "discord.js";
import { bumpReminders, stickyMessages } from "@knox/db";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { logger } from "../../../logger.js";

export const DISBOARD_ID = "302050872383242240";
export const BUMP_INTERVAL_MS = 2 * 60 * 60_000;

/** DISBOARD confirms a successful bump with "Bump done" in its embed */
export function isBumpDone(text: string | null | undefined) {
  return Boolean(text && /bump done/i.test(text));
}

/** the first line of a post as a thread name: links and mentions dropped, cut to 80 characters */
export function threadNameFor(content: string, fallback: string) {
  const line = content.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  const cleaned = line
    .replace(/https?:\/\/\S+/g, "")
    .replace(/<[@#&!:a-z0-9_]+>/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return fallback.slice(0, 100);
  return cleaned.length > 80 ? `${cleaned.slice(0, 77).trimEnd()}…` : cleaned;
}

export type StickyEntry = { guildId: string; content: string; lastMessageId: string | null };

/** deletes the previous copy and posts the sticky note again at the bottom of the channel */
export async function repostSticky(client: KnoxClient, channel: GuildTextBasedChannel, entry: StickyEntry) {
  if (entry.lastMessageId) await channel.messages.delete(entry.lastMessageId).catch(() => undefined);
  const cached = await client.guildConfig.get(entry.guildId);
  const sent = await channel.send({
    embeds: [knoxEmbed(cached.settings.embedColor).setDescription(entry.content).setFooter({ text: "📌 sticky note" })],
    allowedMentions: { parse: [] },
  });
  const next: StickyEntry = { ...entry, lastMessageId: sent.id };
  client.stickies.set(channel.id, next);
  await client.db.update(stickyMessages).set({ lastMessageId: sent.id }).where(eq(stickyMessages.channelId, channel.id));
  return sent;
}

/** reminders whose two hours are up: say so where the bump happened */
export async function runBumpReminders(client: KnoxClient) {
  const due = await client.db.select().from(bumpReminders).where(lt(bumpReminders.dueAt, new Date()));
  for (const row of due) {
    // claim first, so a slow send can't fire twice
    const claimed = await client.db
      .delete(bumpReminders)
      .where(and(eq(bumpReminders.guildId, row.guildId), eq(bumpReminders.dueAt, row.dueAt)))
      .returning({ guildId: bumpReminders.guildId });
    if (!claimed.length) continue;
    const guild = client.guilds.cache.get(row.guildId);
    if (!guild) continue;
    const cached = await client.guildConfig.get(guild.id);
    const features = cached.settings.features;
    if (!cached.settings.moduleFlags.community || !features.bumpReminderEnabled) continue;
    const channel = await guild.channels.fetch(row.channelId).catch(() => null);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) continue;
    const roleId = features.bumpReminderRoleId;
    const everyone = roleId === guild.id;
    const mention = roleId ? (everyone ? "@everyone " : `<@&${roleId}> `) : "";
    await channel
      .send({
        content: `${mention}⏰ Time to bump! Type \`/bump\` here to put **${guild.name}** back on top of DISBOARD.`,
        allowedMentions: roleId ? (everyone ? { parse: ["everyone"] } : { roles: [roleId] }) : { parse: [] },
      })
      .catch((err) => logger.debug({ err, guildId: guild.id }, "bump reminder failed"));
  }
}
