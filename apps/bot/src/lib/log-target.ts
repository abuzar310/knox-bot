// Which channel a log line belongs in. A specific channel wins; otherwise the one log channel is used.
import { EmbedBuilder, type Guild, type MessageCreateOptions } from "discord.js";
import type { GuildSettings } from "@knox/config";

export type LogStream = "mod" | "messages" | "members" | "joins" | "server" | "voice";

export function streamChannelId(settings: GuildSettings | null | undefined, stream: LogStream): string | null {
  if (!settings) return null;
  const f = settings.features;
  const specific =
    stream === "messages" ? f.logMessageChannelId
    : stream === "members" ? f.logMemberChannelId
    : stream === "joins" ? f.logJoinChannelId
    : stream === "server" ? f.logServerChannelId
    : stream === "voice" ? f.logVoiceChannelId
    : null;
  return specific || settings.logChannelId;
}

export async function postLog(
  guild: Guild,
  settings: GuildSettings | null | undefined,
  stream: LogStream,
  payload: string | { embeds: EmbedBuilder[] },
) {
  const channelId = streamChannelId(settings, stream);
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
  const body: MessageCreateOptions = typeof payload === "string"
    ? { content: payload.slice(0, 1900), allowedMentions: { parse: [] } }
    : { embeds: payload.embeds, allowedMentions: { parse: [] } };
  await channel.send(body).catch(() => undefined);
}
