import { eq, lt } from "drizzle-orm";
import { giveaways, memberProfiles, reminders } from "@knox/db";
import type { KnoxClient } from "./client.js";
import { finishGiveaway } from "./modules/community/lib/giveaway-finish.js";
import { logger } from "./logger.js";

let lastBirthdayKey = "";

export function startJobs(client: KnoxClient) {
  setInterval(() => {
    void tick(client);
  }, 30_000);
}

async function tick(client: KnoxClient) {
  try {
    const dueGiveaways = await client.db
      .select()
      .from(giveaways)
      .where(lt(giveaways.endsAt, new Date()));
    for (const row of dueGiveaways.filter((g) => !g.ended)) {
      await finishGiveaway(client, row.id);
    }

    const dueReminders = await client.db
      .select()
      .from(reminders)
      .where(lt(reminders.fireAt, new Date()));
    for (const row of dueReminders) {
      const guild = client.guilds.cache.get(row.guildId);
      const channel = guild ? await guild.channels.fetch(row.channelId).catch(() => null) : null;
      if (channel?.isTextBased() && !channel.isDMBased()) {
        await channel.send(`<@${row.userId}> reminder: ${row.text}`).catch(() => undefined);
      }
      await client.db.delete(reminders).where(eq(reminders.id, row.id));
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
          await channel.send(`Happy birthday <@${person.userId}>!`).catch(() => undefined);
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
