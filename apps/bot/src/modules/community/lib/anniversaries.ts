// Once a day, members who joined on this date a year or more ago get a shout-out in the anniversary channel.
import { ne } from "drizzle-orm";
import { dailyRuns } from "@knox/db";
import type { KnoxClient } from "../../../client.js";
import { logger } from "../../../logger.js";

/** fetching every member is the expensive part; very large servers are skipped */
const MAX_MEMBERS = 5000;
const MAX_NAMED = 20;

export async function runAnniversaries(client: KnoxClient, now: Date) {
  const today = now.toISOString().slice(0, 10);
  for (const guild of client.guilds.cache.values()) {
    const cached = await client.guildConfig.get(guild.id);
    const channelId = cached.settings.features.anniversaryChannelId;
    if (!cached.settings.moduleFlags.community || !channelId) continue;
    if (guild.memberCount > MAX_MEMBERS) continue;
    // one run per server per UTC day, whatever restarts happen in between
    const claimed = await client.db
      .insert(dailyRuns)
      .values({ guildId: guild.id, job: "anniversary", lastDate: today })
      .onConflictDoUpdate({ target: [dailyRuns.guildId, dailyRuns.job], set: { lastDate: today }, setWhere: ne(dailyRuns.lastDate, today) })
      .returning({ guildId: dailyRuns.guildId });
    if (!claimed.length) continue;
    try {
      const members = await guild.members.fetch();
      const celebrating = [...members.values()]
        .filter((m) => {
          if (m.user.bot || !m.joinedAt) return false;
          const joined = m.joinedAt;
          return joined.getUTCMonth() === now.getUTCMonth() && joined.getUTCDate() === now.getUTCDate() && now.getUTCFullYear() - joined.getUTCFullYear() >= 1;
        })
        .map((m) => ({ id: m.id, years: now.getUTCFullYear() - (m.joinedAt as Date).getUTCFullYear() }))
        .sort((a, b) => b.years - a.years);
      if (!celebrating.length) continue;
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased() || channel.isDMBased()) continue;
      const named = celebrating.slice(0, MAX_NAMED);
      const lines = named.map((c) => `<@${c.id}> · ${c.years} ${c.years === 1 ? "year" : "years"}`);
      const more = celebrating.length > named.length ? `\n…and ${celebrating.length - named.length} more` : "";
      await channel.send({
        content: `🎉 **Server anniversary!** Joined **${guild.name}** on this day:\n${lines.join("\n")}${more}`,
        allowedMentions: { users: named.map((c) => c.id) },
      });
    } catch (err) {
      logger.debug({ err, guildId: guild.id }, "anniversaries failed");
    }
  }
}
