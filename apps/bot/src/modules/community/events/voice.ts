import { ChannelType, Events, type Client, type VoiceState } from "discord.js";
import { eq } from "drizzle-orm";
import { tempVoiceChannels } from "@knox/db";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { logger } from "../../../logger.js";

/** when each member last got a room from the hub: ten seconds between rooms stops join-leave spam */
const lastRoomAt = new Map<string, number>();

async function forget(client: KnoxClient, channelId: string) {
  client.tempVoices.delete(channelId);
  try {
    await client.db.delete(tempVoiceChannels).where(eq(tempVoiceChannels.channelId, channelId));
  } catch {
    /* the row is gone or the database is busy; the startup sweep will catch it */
  }
}

export const voiceHubEvent: KnoxBoundEvent = {
  name: Events.VoiceStateUpdate,
  async execute(...args: unknown[]) {
    const oldState = args[0] as VoiceState;
    const newState = args[1] as VoiceState;
    const guild = newState.guild;
    const client = guild.client as KnoxClient;
    const cached = await client.guildConfig.get(guild.id);
    if (!cached.settings.moduleFlags.community) return;
    const hubId = cached.settings.features.voiceHubChannelId;
    if (!hubId) return;

    if (newState.channelId === hubId && newState.member && !newState.member.user.bot) {
      const key = `${guild.id}:${newState.member.id}`;
      if (Date.now() - (lastRoomAt.get(key) ?? 0) < 10_000) return;
      lastRoomAt.set(key, Date.now());
      const created = await guild.channels.create({
        name: `${newState.member.displayName}'s room`,
        type: ChannelType.GuildVoice,
        parent: newState.channel?.parentId ?? undefined,
        reason: "ZARU temp voice",
      });
      client.tempVoices.add(created.id);
      try {
        await client.db.insert(tempVoiceChannels).values({ channelId: created.id, guildId: guild.id, ownerId: newState.member.id });
      } catch {
        /* remembered in memory only until the next restart */
      }
      await newState.member.voice.setChannel(created).catch(async () => {
        await created.delete().catch(() => undefined);
        await forget(client, created.id);
      });
    }

    if (oldState.channelId && client.tempVoices.has(oldState.channelId)) {
      const ch = oldState.channel;
      if (ch && ch.members.filter((m) => !m.user.bot).size === 0) {
        await ch.delete("Empty temp voice").catch(() => undefined);
        await forget(client, oldState.channelId);
      }
    }
  },
};

/** after a restart: rooms the hub made are remembered again, and empty ones are removed */
export const tempVoiceSweepEvent: KnoxBoundEvent = {
  name: Events.ClientReady,
  once: true,
  async execute(...args: unknown[]) {
    const client = (args[0] as Client).user ? ((args[0] as Client) as KnoxClient) : null;
    if (!client) return;
    let rows: Array<typeof tempVoiceChannels.$inferSelect> | null = null;
    // right after boot the database pool is still filling; a failed read is retried a few times before giving up
    for (let attempt = 1; attempt <= 4 && !rows; attempt++) {
      try {
        rows = await client.db.select().from(tempVoiceChannels);
      } catch (error) {
        if (attempt === 4) {
          logger.warn({ err: error }, "temp voice sweep could not read the table");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 5_000 * attempt));
      }
    }
    if (!rows) return;
    let removed = 0;
    for (const row of rows) {
      const guild = client.guilds.cache.get(row.guildId);
      const channel = guild ? (guild.channels.cache.get(row.channelId) ?? (await guild.channels.fetch(row.channelId).catch(() => null))) : null;
      if (!channel || !channel.isVoiceBased()) {
        await forget(client, row.channelId);
        continue;
      }
      if (channel.members.filter((m) => !m.user.bot).size === 0) {
        await channel.delete("Empty temp voice (after restart)").catch(() => undefined);
        await forget(client, row.channelId);
        removed++;
      } else {
        client.tempVoices.add(channel.id);
      }
    }
    if (rows.length) logger.info({ remembered: rows.length, removed }, "temp voice rooms swept");
  },
};

export const voiceLogEvent: KnoxBoundEvent = {
  name: Events.VoiceStateUpdate,
  async execute(...args: unknown[]) {
    const oldState = args[0] as VoiceState;
    const newState = args[1] as VoiceState;
    if (!newState.member || newState.member.user.bot) return;
    if (oldState.channelId === newState.channelId) return;
    const client = newState.guild.client as KnoxClient;
    const cached = await client.guildConfig.get(newState.guild.id);
    if (!cached.settings.moduleFlags.community) return;
    if (!cached.settings.features.logVoice || !cached.settings.logChannelId) return;
    const log = await newState.guild.channels.fetch(cached.settings.logChannelId).catch(() => null);
    if (!log || !log.isTextBased() || log.isDMBased()) return;
    const action = !oldState.channelId
      ? `joined ${newState.channel}`
      : !newState.channelId
        ? `left ${oldState.channel}`
        : `moved ${oldState.channel} → ${newState.channel}`;
    await log.send(`${newState.member} ${action}`);
  },
};
