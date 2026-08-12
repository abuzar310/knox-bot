import { Events, type Message } from "discord.js";
import { and, eq } from "drizzle-orm";
import { memberProfiles } from "@knox/db";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { persistGuildSettings } from "../../../config/save-settings.js";

export const countingEvent: KnoxBoundEvent = {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const message = args[0] as Message;
    if (!message.guild || message.author.bot) return;
    const client = message.client as KnoxClient;
    const cached = await client.guildConfig.get(message.guild.id);
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
    const [self] = await client.db
      .select()
      .from(memberProfiles)
      .where(
        and(
          eq(memberProfiles.guildId, message.guild.id),
          eq(memberProfiles.userId, message.author.id),
        ),
      )
      .limit(1);
    if (self?.afkReason) {
      await client.db
        .update(memberProfiles)
        .set({ afkReason: null })
        .where(
          and(
            eq(memberProfiles.guildId, message.guild.id),
            eq(memberProfiles.userId, message.author.id),
          ),
        );
      await message.reply("Welcome back. AFK removed.").catch(() => undefined);
    }
    for (const user of message.mentions.users.values()) {
      const [row] = await client.db
        .select()
        .from(memberProfiles)
        .where(
          and(eq(memberProfiles.guildId, message.guild.id), eq(memberProfiles.userId, user.id)),
        )
        .limit(1);
      if (row?.afkReason) {
        await message.reply(`${user} is AFK: ${row.afkReason}`).catch(() => undefined);
      }
    }
  },
};
