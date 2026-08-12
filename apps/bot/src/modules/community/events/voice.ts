import { ChannelType, Events, type VoiceState } from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";

export const voiceHubEvent: KnoxBoundEvent = {
  name: Events.VoiceStateUpdate,
  async execute(...args: unknown[]) {
    const oldState = args[0] as VoiceState;
    const newState = args[1] as VoiceState;
    const guild = newState.guild;
    const client = guild.client as KnoxClient;
    const cached = await client.guildConfig.get(guild.id);
    const hubId = cached.settings.features.voiceHubChannelId;
    if (!hubId) return;

    if (newState.channelId === hubId && newState.member && !newState.member.user.bot) {
      const created = await guild.channels.create({
        name: `${newState.member.displayName}'s room`,
        type: ChannelType.GuildVoice,
        parent: newState.channel?.parentId ?? undefined,
        reason: "Knox temp voice",
      });
      client.tempVoices.add(created.id);
      await newState.member.voice.setChannel(created).catch(() => {
        created.delete().catch(() => undefined);
        client.tempVoices.delete(created.id);
      });
    }

    if (oldState.channelId && client.tempVoices.has(oldState.channelId)) {
      const ch = oldState.channel;
      if (ch && ch.members.filter((m) => !m.user.bot).size === 0) {
        client.tempVoices.delete(oldState.channelId);
        await ch.delete("Empty temp voice").catch(() => undefined);
      }
    }
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
