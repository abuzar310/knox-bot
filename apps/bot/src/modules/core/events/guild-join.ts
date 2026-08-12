import {
  AuditLogEvent,
  ChannelType,
  Events,
  PermissionFlagsBits,
  type Guild,
  type NewsChannel,
  type TextChannel,
  type User,
} from "discord.js";
import type { KnoxBoundEvent } from "../../../types.js";
import type { KnoxClient } from "../../../client.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { ensureGuildSettings } from "../../../config/save-settings.js";
import { logger } from "../../../logger.js";

function dashboardUrl() {
  return process.env.KNOX_WEB_URL?.replace(/\/$/, "") || "https://knox-web-gdf2.onrender.com";
}

function introEmbed(inviter: User | null) {
  const who = inviter ? `${inviter}, thanks for adding Knox.` : "Thanks for adding Knox.";
  return knoxEmbed()
    .setTitle("Knox is in")
    .setDescription(
      `${who}\n\n` +
        "Start here:\n" +
        "• `/setup start` — welcome, goodbye, invites, autorole, logs\n" +
        "• `/setup template preset:Gaming` — install channels and roles\n" +
        "• `/help` — everything Knox can do\n\n" +
        `Dashboard: ${dashboardUrl()}/dashboard`,
    )
    .setFooter({ text: "Nothing is wiped. Template install only adds missing channels." });
}

async function findInviter(guild: Guild): Promise<User | null> {
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 8 });
    const botId = guild.client.user?.id;
    const entry = logs.entries.find((e) => e.targetId === botId);
    const executor = entry?.executor;
    if (!executor || executor.partial) {
      if (!entry?.executorId) return null;
      return guild.client.users.fetch(entry.executorId).catch(() => null);
    }
    return executor;
  } catch {
    return null;
  }
}

async function findIntroChannel(guild: Guild): Promise<TextChannel | NewsChannel | null> {
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const canTalk = (channel: TextChannel | NewsChannel | null | undefined) =>
    Boolean(
      channel &&
        channel.permissionsFor(me)?.has([
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
        ]),
    );

  if (guild.systemChannel && canTalk(guild.systemChannel)) return guild.systemChannel;

  const text = [...guild.channels.cache.values()]
    .filter(
      (ch): ch is TextChannel | NewsChannel =>
        ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement,
    )
    .filter((ch) => canTalk(ch))
    .sort((a, b) => a.rawPosition - b.rawPosition)[0];

  return text ?? null;
}

export const guildJoinEvent: KnoxBoundEvent = {
  name: Events.GuildCreate,
  async execute(...args: unknown[]) {
    const guild = args[0] as Guild;
    if (!guild.available) return;
    if (guild.joinedTimestamp && Date.now() - guild.joinedTimestamp > 90_000) return;

    const client = guild.client as KnoxClient;
    try {
      await ensureGuildSettings(client, {
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        ownerId: guild.ownerId,
      });
    } catch (err) {
      logger.warn({ err, guildId: guild.id }, "join settings failed");
    }

    const inviter = (await findInviter(guild)) ?? (await guild.fetchOwner().catch(() => null))?.user ?? null;
    const embed = introEmbed(inviter);

    if (inviter) {
      await inviter.send({ embeds: [embed] }).catch(() => undefined);
    }

    const channel = await findIntroChannel(guild);
    if (channel) {
      await channel.send({ embeds: [embed] }).catch((err) => {
        logger.warn({ err, guildId: guild.id }, "join intro channel failed");
      });
    }
  },
};
