// The activity summary embed, used by /stats and by the Monday digest.
import type { Guild } from "discord.js";
import { ne } from "drizzle-orm";
import { dailyRuns } from "@knox/db";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { formatHours, statsSummary, type StatsSummary } from "../../../lib/stats.js";
import { logger } from "../../../logger.js";

export function statsEmbed(guild: Guild, summary: StatsSummary, color: string, title: string) {
  const net = summary.joins - summary.leaves;
  const embed = knoxEmbed(color)
    .setTitle(title)
    .setDescription(`Last ${summary.days} day${summary.days === 1 ? "" : "s"} in **${guild.name}** · ${guild.memberCount.toLocaleString()} members now`)
    .addFields(
      { name: "Messages", value: summary.messages.toLocaleString(), inline: true },
      { name: "Joined / left", value: `${summary.joins} / ${summary.leaves} (${net >= 0 ? "+" : ""}${net})`, inline: true },
      { name: "Voice time", value: formatHours(summary.voiceMinutes), inline: true },
    );
  if (summary.topMembers.length) {
    embed.addFields({ name: "Most active", value: summary.topMembers.map((m, i) => `${i + 1}. <@${m.userId}> · ${m.messages.toLocaleString()}`).join("\n"), inline: true });
  }
  if (summary.topChannels.length) {
    embed.addFields({ name: "Busiest channels", value: summary.topChannels.map((c, i) => `${i + 1}. <#${c.channelId}> · ${c.messages.toLocaleString()}`).join("\n"), inline: true });
  }
  if (!summary.messages && !summary.joins && !summary.voiceMinutes) embed.setFooter({ text: "Counting started recently; numbers fill in from here." });
  return embed;
}

/** Monday mornings (08:00 UTC block): last week's numbers to the digest channel, once per server */
export async function runWeeklyDigest(client: KnoxClient, now: Date) {
  const today = now.toISOString().slice(0, 10);
  for (const guild of client.guilds.cache.values()) {
    const cached = await client.guildConfig.get(guild.id);
    const channelId = cached.settings.features.digestChannelId;
    if (!cached.settings.moduleFlags.community || !channelId) continue;
    const claimed = await client.db
      .insert(dailyRuns)
      .values({ guildId: guild.id, job: "digest", lastDate: today })
      .onConflictDoUpdate({ target: [dailyRuns.guildId, dailyRuns.job], set: { lastDate: today }, setWhere: ne(dailyRuns.lastDate, today) })
      .returning({ guildId: dailyRuns.guildId });
    if (!claimed.length) continue;
    try {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased() || channel.isDMBased()) continue;
      const summary = await statsSummary(client, guild.id, 7);
      await channel.send({ embeds: [statsEmbed(guild, summary, cached.settings.embedColor, "📊 Weekly digest")], allowedMentions: { parse: [] } });
    } catch (err) {
      logger.debug({ err, guildId: guild.id }, "weekly digest failed");
    }
  }
}
