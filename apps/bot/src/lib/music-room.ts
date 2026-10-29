// A 24/7 music room: a voice channel in the voice category, and the text channel where the panel appears.
import { ChannelType, type Guild, type GuildMember, type TextChannel, type VoiceBasedChannel } from "discord.js";

export function playVoice(
  guild: Guild,
  member: GuildMember,
  alwaysId: string | null,
): { channel: VoiceBasedChannel } | { error: string } {
  const here = member.voice.channel;
  if (alwaysId) {
    const room = guild.channels.cache.get(alwaysId);
    if (room && (room.type === ChannelType.GuildVoice || room.type === ChannelType.GuildStageVoice)) {
      if (here?.id !== room.id) return { error: `Join <#${room.id}> to play. The panel appears in the channel where you type the command.` };
      return { channel: room };
    }
  }
  if (!here || (here.type !== ChannelType.GuildVoice && here.type !== ChannelType.GuildStageVoice)) {
    return { error: "Join a voice channel first." };
  }
  return { channel: here };
}

function voiceCategory(guild: Guild) {
  const categories = [...guild.channels.cache.values()].filter((channel) => channel.type === ChannelType.GuildCategory);
  return (
    categories.find((channel) => /voice/i.test(channel.name)) ??
    categories.find((channel) => guild.channels.cache.some((child) => child.parentId === channel.id && child.isVoiceBased())) ??
    null
  );
}

export async function setupMusicRoom(guild: Guild): Promise<{ voice: VoiceBasedChannel; text: TextChannel }> {
  const category = voiceCategory(guild);
  if (!category) throw new Error("No voice category yet. Make a category with Voice in the name, then run this again.");

  let voice = guild.channels.cache.find(
    (channel) => channel.parentId === category.id && channel.isVoiceBased() && /^music$/i.test(channel.name),
  );
  if (!voice || !voice.isVoiceBased()) {
    voice = await guild.channels.create({
      name: "Music",
      type: ChannelType.GuildVoice,
      parent: category.id,
      reason: "ZARU 24/7 music",
    });
  }

  let text = guild.channels.cache.find(
    (channel): channel is TextChannel =>
      channel.parentId === category.id && channel.type === ChannelType.GuildText && channel.name === "music",
  );
  if (!text) {
    text = await guild.channels.create({
      name: "music",
      type: ChannelType.GuildText,
      parent: category.id,
      topic: "Type a song name, or ?play song name. The panel appears here. ZARU stays in the Music voice channel.",
      reason: "ZARU music commands",
    });
  }
  return { voice, text };
}
