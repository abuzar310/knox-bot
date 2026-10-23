// What happens when a member reaches a new level, from chat or from voice: reward roles, then an announcement.
import { and, eq } from "drizzle-orm";
import type { Guild, GuildMember, TextBasedChannel } from "discord.js";
import { levelRewards } from "@knox/db";
import type { KnoxClient } from "../client.js";
import { canGrantRole } from "./roles.js";
import { knoxEmbed } from "../interactions/embed.js";

export async function applyLevelUp(
  client: KnoxClient,
  guild: Guild,
  member: GuildMember,
  level: number,
  embedColor: string,
  announceChannelId: string | null,
  fallback?: TextBasedChannel | null,
  how: "chat" | "voice" = "chat",
) {
  const rewards = await client.db.select().from(levelRewards).where(and(eq(levelRewards.guildId, guild.id), eq(levelRewards.level, level)));
  for (const reward of rewards) {
    const role = guild.roles.cache.get(reward.roleId);
    if (canGrantRole(role)) await member.roles.add(role, `Level ${level} reward`).catch(() => undefined);
  }
  const channel = announceChannelId ? await guild.channels.fetch(announceChannelId).catch(() => null) : fallback ?? null;
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
  await channel
    .send({
      embeds: [knoxEmbed(embedColor).setTitle("Level up").setDescription(`${member} hit **level ${level}**${how === "voice" ? " (voice time)" : ""}`)],
      allowedMentions: { users: [member.id] },
    })
    .catch(() => undefined);
}
