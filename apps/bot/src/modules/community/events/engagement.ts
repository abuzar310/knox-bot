import {
  ChannelType,
  Events,
  PermissionFlagsBits,
  ThreadAutoArchiveDuration,
  type GuildTextBasedChannel,
  type Message,
} from "discord.js";
import { bumpReminders, stickyMessages } from "@knox/db";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { logger } from "../../../logger.js";
import { BUMP_INTERVAL_MS, DISBOARD_ID, isBumpDone, repostSticky, threadNameFor } from "../lib/engagement.js";

/** a burst of messages moves the note once, after the burst */
const STICKY_DEBOUNCE_MS = 4_000;

/** sticky notes are loaded once at start, so each message costs a Map lookup and no query */
export const stickySweepEvent: KnoxBoundEvent = {
  name: Events.ClientReady,
  once: true,
  async execute(...args: unknown[]) {
    const client = args[0] as KnoxClient;
    const rows = await client.db.select().from(stickyMessages);
    for (const row of rows) {
      client.stickies.set(row.channelId, { guildId: row.guildId, content: row.content, lastMessageId: row.lastMessageId });
    }
  },
};

export const stickyEvent: KnoxBoundEvent = {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const message = args[0] as Message;
    if (!message.guild) return;
    const client = message.client as KnoxClient;
    const entry = client.stickies.get(message.channelId);
    if (!entry || message.author.id === client.user?.id) return;
    const cached = await client.guildConfig.get(message.guild.id);
    if (!cached.settings.moduleFlags.community) return;
    const channel = message.channel;
    if (!channel.isTextBased() || channel.isDMBased()) return;
    if (client.stickyTimers.has(message.channelId)) return;
    const timer = setTimeout(() => {
      client.stickyTimers.delete(message.channelId);
      const current = client.stickies.get(message.channelId);
      if (!current) return;
      void repostSticky(client, channel as GuildTextBasedChannel, current).catch((err) =>
        logger.debug({ err, channelId: message.channelId }, "sticky repost failed"),
      );
    }, STICKY_DEBOUNCE_MS);
    timer.unref();
    client.stickyTimers.set(message.channelId, timer);
  },
};

export const autoThreadEvent: KnoxBoundEvent = {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const message = args[0] as Message;
    if (!message.guild || message.author.bot || message.system || message.hasThread) return;
    const channel = message.channel;
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) return;
    if (!message.content.trim() && !message.attachments.size) return;
    const client = message.client as KnoxClient;
    const cached = await client.guildConfig.get(message.guild.id);
    if (!cached.settings.moduleFlags.community) return;
    if (!cached.settings.features.autoThreadChannelIds.includes(message.channelId)) return;
    const me = message.guild.members.me;
    if (!me || !channel.permissionsFor(me).has(PermissionFlagsBits.CreatePublicThreads)) return;
    await message
      .startThread({
        name: threadNameFor(message.content, `${message.member?.displayName ?? message.author.username}'s post`),
        autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
        reason: "Auto-thread channel",
      })
      .catch((err) => logger.debug({ err, channelId: message.channelId }, "auto-thread failed"));
  },
};

export const bumpEvent: KnoxBoundEvent = {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const message = args[0] as Message;
    if (!message.guild || message.author.id !== DISBOARD_ID) return;
    const client = message.client as KnoxClient;
    const cached = await client.guildConfig.get(message.guild.id);
    if (!cached.settings.moduleFlags.community || !cached.settings.features.bumpReminderEnabled) return;
    const embed = message.embeds[0];
    if (!isBumpDone(embed?.description) && !isBumpDone(embed?.title)) return;
    const dueAt = new Date(Date.now() + BUMP_INTERVAL_MS);
    await client.db
      .insert(bumpReminders)
      .values({ guildId: message.guild.id, channelId: message.channelId, dueAt })
      .onConflictDoUpdate({ target: bumpReminders.guildId, set: { channelId: message.channelId, dueAt } });
    await message.react("⏰").catch(() => undefined);
  },
};
