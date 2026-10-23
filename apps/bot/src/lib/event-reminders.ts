// Discord scheduled events: a reminder half an hour before each one starts, in the server's events channel.
import { EmbedBuilder, GuildScheduledEventStatus, type Guild, type GuildScheduledEvent } from "discord.js";
import { eventReminders } from "@knox/db";
import type { KnoxClient } from "../client.js";
import { knoxEmbed } from "../interactions/embed.js";
import { logger } from "../logger.js";

const CHECK_EVERY_MS = 5 * 60_000;
const REMIND_BEFORE_MS = 30 * 60_000;

export function eventLink(guildId: string, eventId: string) {
  return `https://discord.com/events/${guildId}/${eventId}`;
}

export function eventEmbed(event: GuildScheduledEvent, color: string, heading: string): EmbedBuilder {
  const start = event.scheduledStartTimestamp ? Math.floor(event.scheduledStartTimestamp / 1000) : null;
  const where = event.channelId ? `<#${event.channelId}>` : event.entityMetadata?.location ?? "see event";
  const embed = knoxEmbed(color)
    .setTitle(`${heading}: ${event.name}`.slice(0, 256))
    .setURL(eventLink(event.guildId, event.id))
    .addFields({ name: "When", value: start ? `<t:${start}:F> (<t:${start}:R>)` : "soon", inline: true }, { name: "Where", value: where.slice(0, 100), inline: true });
  if (event.description) embed.setDescription(event.description.slice(0, 400));
  if (event.userCount) embed.setFooter({ text: `${event.userCount} interested` });
  const cover = event.coverImageURL({ size: 1024 });
  if (cover) embed.setImage(cover);
  return embed;
}

async function postInEventsChannel(client: KnoxClient, guild: Guild, embed: EmbedBuilder, content: string, roleId: string | null) {
  const cached = await client.guildConfig.get(guild.id);
  const channelId = cached.settings.features.eventReminderChannelId;
  if (!channelId) return false;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return false;
  const everyone = roleId === guild.id;
  await channel.send({
    content: roleId ? `${everyone ? "@everyone" : `<@&${roleId}>`} ${content}` : content,
    embeds: [embed],
    allowedMentions: roleId ? (everyone ? { parse: ["everyone"] } : { roles: [roleId] }) : { parse: [] },
  });
  return true;
}

/** a brand-new event is announced right away (from the gateway event) */
export async function announceNewEvent(client: KnoxClient, event: GuildScheduledEvent) {
  const guild = event.guild ?? client.guilds.cache.get(event.guildId);
  if (!guild) return;
  const cached = await client.guildConfig.get(guild.id);
  if (!cached.settings.moduleFlags.community || !cached.settings.features.eventReminderChannelId) return;
  await postInEventsChannel(client, guild, eventEmbed(event, cached.settings.embedColor, "New event"), "A new event is on the calendar. Hit Interested to be reminded.", null).catch((err) =>
    logger.debug({ err, guildId: guild.id }, "new event announce failed"),
  );
}

/** every five minutes per server: events starting within half an hour get one reminder each */
export async function runEventReminders(client: KnoxClient) {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    if (now - (client.eventsCheckedAt.get(guild.id) ?? 0) < CHECK_EVERY_MS) continue;
    client.eventsCheckedAt.set(guild.id, now);
    const cached = await client.guildConfig.get(guild.id);
    const features = cached.settings.features;
    if (!cached.settings.moduleFlags.community || !features.eventReminderChannelId) continue;
    const events = await guild.scheduledEvents.fetch().catch(() => null);
    if (!events) continue;
    for (const event of events.values()) {
      if (event.status !== GuildScheduledEventStatus.Scheduled || !event.scheduledStartTimestamp) continue;
      const untilStart = event.scheduledStartTimestamp - now;
      if (untilStart > REMIND_BEFORE_MS || untilStart < -5 * 60_000) continue;
      const claimed = await client.db.insert(eventReminders).values({ eventId: event.id, guildId: guild.id }).onConflictDoNothing().returning({ eventId: eventReminders.eventId });
      if (!claimed.length) continue;
      await postInEventsChannel(client, guild, eventEmbed(event, cached.settings.embedColor, "Starting soon"), `**${event.name}** starts <t:${Math.floor(event.scheduledStartTimestamp / 1000)}:R>.`, features.eventReminderRoleId).catch((err) =>
        logger.debug({ err, guildId: guild.id, eventId: event.id }, "event reminder failed"),
      );
    }
  }
}
