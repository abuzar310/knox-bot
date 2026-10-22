import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { giveaways, memberProfiles, modCases, reminders } from "@knox/db";
import type { KnoxClient } from "./client.js";
import { finishGiveaway } from "./modules/community/lib/giveaway-finish.js";
import { logLine } from "./modules/moderation/lib/modlog.js";
import { logger } from "./logger.js";

let lastBirthdayKey = "";
let running = false;

export function startJobs(client: KnoxClient) {
  setInterval(() => {
    // a slow tick must finish before the next starts, or a reminder goes out twice
    if (running) return;
    running = true;
    void tick(client).finally(() => {
      running = false;
    });
  }, 30_000);
}

async function tick(client: KnoxClient) {
  try {
    const dueGiveaways = await client.db
      .select()
      .from(giveaways)
      .where(and(lt(giveaways.endsAt, new Date()), eq(giveaways.ended, false)));
    for (const row of dueGiveaways) {
      await finishGiveaway(client, row.id);
    }

    const dueReminders = await client.db
      .select()
      .from(reminders)
      .where(lt(reminders.fireAt, new Date()));
    for (const row of dueReminders) {
      // claim it first: if sending is slow, the next tick won't send it again
      const claimed = await client.db.delete(reminders).where(eq(reminders.id, row.id)).returning({ id: reminders.id });
      if (!claimed.length) continue;
      const guild = client.guilds.cache.get(row.guildId);
      const channel = guild ? await guild.channels.fetch(row.channelId).catch(() => null) : null;
      if (channel?.isTextBased() && !channel.isDMBased()) {
        await channel
          .send({ content: `<@${row.userId}> reminder: ${row.text}`, allowedMentions: { users: [row.userId] } })
          .catch(() => undefined);
      }
    }

    // temporary bans whose time is up: lift them and close the case
    const expiredBans = await client.db
      .select()
      .from(modCases)
      .where(
        and(
          eq(modCases.type, "ban"),
          eq(modCases.active, true),
          isNotNull(modCases.durationMs),
          sql`${modCases.createdAt} + (${modCases.durationMs} || ' milliseconds')::interval < now()`,
        ),
      );
    for (const ban of expiredBans) {
      const guild = client.guilds.cache.get(ban.guildId);
      const lifted = guild ? await guild.members.unban(ban.targetId, `Temporary ban (case #${ban.caseNumber}) ran out`).then(() => true, () => false) : false;
      await client.db.update(modCases).set({ active: false }).where(eq(modCases.id, ban.id));
      if (guild) {
        const cached = await client.guildConfig.get(guild.id);
        await logLine(guild, cached.settings, "Temporary ban ended", `<@${ban.targetId}> · case #${ban.caseNumber}${lifted ? "" : " (was already unbanned)"}`);
      }
    }

    const now = new Date();
    const key = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
    if (now.getUTCHours() === 8 && lastBirthdayKey !== key) {
      lastBirthdayKey = key;
      const month = now.getUTCMonth() + 1;
      const day = now.getUTCDate();
      const people = await client.db.select().from(memberProfiles);
      for (const person of people) {
        if (person.birthdayMonth !== month || person.birthdayDay !== day) continue;
        const cached = await client.guildConfig.get(person.guildId);
        const channelId = cached.settings.features.birthdayChannelId;
        if (!channelId) continue;
        const guild = client.guilds.cache.get(person.guildId);
        const channel = guild ? await guild.channels.fetch(channelId).catch(() => null) : null;
        if (channel?.isTextBased() && !channel.isDMBased()) {
          await channel
            .send({ content: `Happy birthday <@${person.userId}>!`, allowedMentions: { users: [person.userId] } })
            .catch(() => undefined);
        }
      }
    }

    for (const guild of client.guilds.cache.values()) {
      const cached = await client.guildConfig.get(guild.id);
      const statsId = cached.settings.features.statsChannelId;
      if (!statsId) continue;
      const ch = await guild.channels.fetch(statsId).catch(() => null);
      if (ch && "setName" in ch) {
        const name = `Members: ${guild.memberCount}`;
        if (ch.name !== name) await ch.setName(name).catch(() => undefined);
      }
    }
  } catch (err) {
    logger.warn({ err }, "job tick failed");
  }
}
