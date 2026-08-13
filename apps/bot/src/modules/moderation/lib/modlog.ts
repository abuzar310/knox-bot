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
      { name: "Reason", value: input.reason || "No reason provided" },
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
