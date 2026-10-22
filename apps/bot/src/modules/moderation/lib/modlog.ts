import {
  EmbedBuilder,
  type Guild,
  type GuildMember,
  type User,
} from "discord.js";
import type { GuildSettings } from "@knox/config";
import { formatDuration } from "./duration.js";

export async function sendModLog(
  guild: Guild,
  settings: GuildSettings | null,
  input: {
    title: string;
    caseNumber: number;
    action: string;
    target: User;
    moderator: User;
    reason: string;
    durationMs?: number | null;
    color?: number;
  },
) {
  const channelId = settings?.logChannelId;
  if (!channelId) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return;

  const embed = new EmbedBuilder()
    .setColor(input.color ?? 0xe8ff47)
    .setTitle(input.title)
    .addFields(
      { name: "Case", value: `#${input.caseNumber}`, inline: true },
      { name: "Action", value: input.action, inline: true },
      {
        name: "Target",
        value: `${input.target.tag} (\`${input.target.id}\`)`,
        inline: false,
      },
      {
        name: "Moderator",
        value: `${input.moderator.tag} (\`${input.moderator.id}\`)`,
        inline: false,
      },
      { name: "Reason", value: (input.reason || "No reason provided").slice(0, 1000) },
    )
    .setTimestamp(new Date());

  if (input.durationMs) {
    embed.addFields({
      name: "Duration",
      value: formatDuration(input.durationMs),
      inline: true,
    });
  }

  await channel.send({ embeds: [embed] });
}

/** a one-line entry in the log channel for actions that have no case (purge, lock, slowmode, lifted bans) */
export async function logLine(guild: Guild, settings: GuildSettings | null, title: string, text: string, color = 0xe8ff47) {
  const channelId = settings?.logChannelId;
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
  await channel
    .send({
      embeds: [new EmbedBuilder().setColor(color).setTitle(title).setDescription(text.slice(0, 2000)).setTimestamp(new Date())],
      allowedMentions: { parse: [] },
    })
    .catch(() => undefined);
}

/** tells the member what happened, by DM, best effort (send it before a kick or ban: afterwards the DM can't open) */
export async function notifyTarget(user: User, guild: Guild, what: string, reason: string, durationMs?: number | null) {
  const when = durationMs ? ` for **${formatDuration(durationMs)}**` : "";
  await user
    .send({ content: `**${guild.name}:** you were ${what}${when}.\nReason: ${(reason || "No reason provided").slice(0, 500)}`, allowedMentions: { parse: [] } })
    .catch(() => undefined);
}

export function canModerate(
  moderator: GuildMember,
  target: GuildMember,
): string | null {
  if (moderator.id === target.id) return "You can't moderate yourself.";
  if (target.id === moderator.guild.ownerId) return "You can't moderate the server owner.";
  if (target.user.bot) return "Use Discord's tools for bots.";
  if (
    moderator.id !== moderator.guild.ownerId &&
    moderator.roles.highest.position <= target.roles.highest.position
  ) {
    return "You can't moderate someone with an equal or higher role.";
  }
  const me = moderator.guild.members.me;
  if (me && me.roles.highest.position <= target.roles.highest.position) {
    return "ZARU's role is too low to moderate that member.";
  }
  return null;
}
