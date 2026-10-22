// Who may touch the music. A control (skip, stop, pause, volume, seek, loop, shuffle, clear, remove, move, leave…)
// is only for people in the bot's voice channel; when the server has mapped a "dj" rank role, the destructive
// ones also need that rank, unless the person is alone with the bot.
import { ChannelType, type ChatInputCommandInteraction, type GuildMember, type VoiceBasedChannel } from "discord.js";
import { hasMinRank } from "@knox/shared";
import type { KnoxClient } from "../client.js";
import { resolveKnoxRank } from "../permissions/resolve.js";

/** the voice channel a member is in, if it is one the bot can play in */
export function memberVoiceChannel(member: GuildMember | null | undefined): VoiceBasedChannel | null {
  const channel = member?.voice.channel;
  if (!channel) return null;
  if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) return null;
  return channel;
}

/** humans (not bots) in a voice channel */
export function listeners(channel: VoiceBasedChannel | null | undefined) {
  return channel ? channel.members.filter((m) => !m.user.bot).size : 0;
}

/**
 * Why this person may not control the music right now, or null when they may.
 * `dj: true` marks a destructive control that needs the dj rank when the server uses one.
 */
export async function controlRefusal(
  interaction: ChatInputCommandInteraction,
  client: KnoxClient,
  opts: { dj?: boolean } = {},
): Promise<string | null> {
  const guild = interaction.guild;
  if (!guild) return null;
  const member = (interaction.member as GuildMember | null) ?? (await guild.members.fetch(interaction.user.id).catch(() => null));
  if (!member) return null;
  const mine = guild.members.me?.voice.channel ?? null;
  const theirs = memberVoiceChannel(member);
  if (!theirs) return "Join a voice channel first.";
  if (mine && theirs.id !== mine.id) return `Join ${mine} to control the music.`;
  if (!opts.dj) return null;
  // alone with the bot: it is your music
  if (listeners(theirs) <= 1) return null;
  const cached = await client.guildConfig.get(guild.id);
  const hasDjRole = cached.permissionRows.some((r) => r.rank === "dj");
  if (!hasDjRole) return null;
  const rank = resolveKnoxRank(member, cached.permissionRows);
  if (rank === "owner" || hasMinRank(rank, "dj")) return null;
  return "That control is for DJs here. Ask a DJ, or use `/skip` to start a vote.";
}

/** true when the person may skip without a vote: DJ, alone with the bot, or no dj role on this server */
export async function canSkipAlone(interaction: ChatInputCommandInteraction, client: KnoxClient) {
  return (await controlRefusal(interaction, client, { dj: true })) === null;
}

// vote-skip: votes are kept per guild for the track they were cast on and vanish once it passes or changes
const skipVotes = new Map<string, { track: string; voters: Set<string> }>();

export function registerSkipVote(guildId: string, track: string, userId: string, needed: number) {
  let vote = skipVotes.get(guildId);
  if (!vote || vote.track !== track) {
    vote = { track, voters: new Set() };
    skipVotes.set(guildId, vote);
  }
  vote.voters.add(userId);
  const count = vote.voters.size;
  const passed = count >= needed;
  if (passed) skipVotes.delete(guildId);
  return { count, needed, passed };
}
