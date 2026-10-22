import { Events, type Message } from "discord.js";
import { and, eq } from "drizzle-orm";
import { memberProfiles } from "@knox/db";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { afkUsers } from "../../../lib/afk-cache.js";

export const countingEvent: KnoxBoundEvent = {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const message = args[0] as Message;
    if (!message.guild || message.author.bot) return;
    const client = message.client as KnoxClient;
    const cached = await client.guildConfig.get(message.guild.id);
    if (!cached.settings.moduleFlags.community) return;
    const f = cached.settings.features;
    if (!f.countingChannelId || message.channelId !== f.countingChannelId) return;
    const n = Number.parseInt(message.content.trim(), 10);
    const expected = f.countingCurrent + 1;
    if (
      !Number.isInteger(n) ||
      n !== expected ||
      message.author.id === f.countingLastUserId
    ) {
      await message.delete().catch(() => undefined);
      return;
    }
    await persistGuildSettings(client, message.guild.id, {
      ...cached.settings,
      features: {
        ...f,
        countingCurrent: n,
        countingLastUserId: message.author.id,
      },
    });
  },
};

export const afkClearEvent: KnoxBoundEvent = {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const message = args[0] as Message;
    if (!message.guild || message.author.bot) return;
    const client = message.client as KnoxClient;
    const cached = await client.guildConfig.get(message.guild.id);
    if (!cached.settings.moduleFlags.community) return;
    // the in-memory set answers "is anyone here AFK?" for every message; the database is read only for a hit
    const afk = await afkUsers(client, message.guild.id);
    if (afk.has(message.author.id)) {
      afk.delete(message.author.id);
      await client.db
        .update(memberProfiles)
        .set({ afkReason: null })
        .where(and(eq(memberProfiles.guildId, message.guild.id), eq(memberProfiles.userId, message.author.id)));
      await message.reply("Welcome back. AFK removed.").catch(() => undefined);
    }
    const mentionedAfk = [...message.mentions.users.values()].filter((u) => afk.has(u.id)).slice(0, 3);
    for (const user of mentionedAfk) {
      const [row] = await client.db
        .select({ afkReason: memberProfiles.afkReason })
        .from(memberProfiles)
        .where(and(eq(memberProfiles.guildId, message.guild.id), eq(memberProfiles.userId, user.id)))
        .limit(1);
      if (row?.afkReason) {
        await message.reply({ content: `${user.username} is AFK: ${row.afkReason}`, allowedMentions: { parse: [] } }).catch(() => undefined);
      }
    }
  },
};
