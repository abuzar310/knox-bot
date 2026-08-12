import { Events, PermissionFlagsBits, type Message } from "discord.js";
import type { KnoxClient } from "../../../client.js";
import type { KnoxEvent } from "../../../types.js";
import { createCase } from "../lib/cases.js";
import { sendModLog } from "../lib/modlog.js";
import { logger } from "../../../logger.js";

const INVITE_RE =
  /(discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/)[a-z0-9-]+/i;

type SpamBucket = { count: number; firstAt: number };
const spamMap = new Map<string, SpamBucket>();

function spamKey(guildId: string, userId: string) {
  return `${guildId}:${userId}`;
}

async function punish(
  client: KnoxClient,
  message: Message,
  reason: string,
) {
  if (!message.guild || !message.member) return;
  const cached = await client.guildConfig.get(message.guild.id);
  if (!cached.settings.moduleFlags.moderation) return;

  await message.delete().catch(() => undefined);

  try {
    await message.member.timeout(10 * 60_000, reason);
  } catch (err) {
    logger.warn({ err }, "automod timeout failed");
  }

  const modCase = await createCase(client.db, {
    guildId: message.guild.id,
    type: "mute",
    targetId: message.author.id,
    moderatorId: client.user?.id ?? "knox",
    reason,
    durationMs: 10 * 60_000,
    active: true,
  });

  await sendModLog(message.guild, cached.settings, {
    title: "Automod action",
    caseNumber: modCase.caseNumber,
    action: "mute",
    target: message.author,
    moderator: client.user!,
    reason,
    durationMs: 10 * 60_000,
    color: 0xff8a4c,
  });
}

export const automodEvent: KnoxEvent<typeof Events.MessageCreate> = {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.guild || message.author.bot || !message.member) return;
    if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

    const client = message.client as KnoxClient;
    if (!client.guildConfig) return;

    const cached = await client.guildConfig.get(message.guild.id);
    const settings = cached.settings;
    if (!settings.moduleFlags.moderation) return;

    const mod = settings.moderation;
    if (mod.ignoredChannelIds.includes(message.channelId)) return;

    if (mod.antiInvite && INVITE_RE.test(message.content)) {
      await punish(client, message, "Automod: invite link");
      return;
    }

    if (
      mod.maxMentions > 0 &&
      message.mentions.users.size + message.mentions.roles.size > mod.maxMentions
    ) {
      await punish(
        client,
        message,
        `Automod: too many mentions (>${mod.maxMentions})`,
      );
      return;
    }

    if (mod.antiSpam) {
      const key = spamKey(message.guild.id, message.author.id);
      const now = Date.now();
      const bucket = spamMap.get(key);
      if (!bucket || now - bucket.firstAt > 7_000) {
        spamMap.set(key, { count: 1, firstAt: now });
      } else {
        bucket.count += 1;
        if (bucket.count >= 6) {
          spamMap.delete(key);
          await punish(client, message, "Automod: message spam");
        }
      }
    }
  },
};
