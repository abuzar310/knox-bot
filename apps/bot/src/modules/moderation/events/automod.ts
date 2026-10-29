import { Events, PermissionFlagsBits, type Message } from "discord.js";
import type { KnoxClient } from "../../../client.js";
import type { KnoxEvent } from "../../../types.js";
import { createCase } from "../lib/cases.js";
import { sendModLog } from "../lib/modlog.js";
import { logger } from "../../../logger.js";
import { findPhishingHost, refreshPhishList } from "../../../lib/safety/phish-list.js";
import { classifyMessage } from "../../../lib/ai-moderation.js";
import { logLine } from "../lib/modlog.js";
import { protectedBlock } from "../lib/modlog.js";
import { ruleHits, type AutomodRule, type MessageFacts } from "../../../lib/automod-rules.js";

/** one "left in place, have a look" line per member per ten minutes */
const aiFlagNoted = new Map<string, number>();

const INVITE_RE =
  /(discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/)[a-z0-9-]+/i;

type SpamBucket = { count: number; firstAt: number };
const spamMap = new Map<string, SpamBucket>();
const ruleBuckets = new Map<string, { count: number; firstAt: number; lastText: string }>();

function factsFor(message: Message, rule: AutomodRule): MessageFacts {
  const key = `${message.guildId}:${message.author.id}:${rule.id}`;
  const now = Date.now();
  const prev = ruleBuckets.get(key);
  const fresh = !prev || now - prev.firstAt > rule.windowSec * 1000;
  const count = fresh ? 1 : prev.count + 1;
  const recentDuplicate = Boolean(!fresh && prev && prev.lastText === message.content && message.content.length > 0);
  ruleBuckets.set(key, { count, firstAt: fresh ? now : prev.firstAt, lastText: message.content });
  return {
    content: message.content,
    channelId: message.channelId,
    roleIds: [...message.member!.roles.cache.keys()],
    mentionCount: message.mentions.users.size + message.mentions.roles.size,
    attachmentCount: message.attachments.size,
    recentCount: count,
    recentDuplicate,
  };
}

async function applyRule(client: KnoxClient, message: Message, rule: AutomodRule) {
  if (!message.guild || !message.member) return;
  const cached = await client.guildConfig.get(message.guild.id);
  const reason = `Automod: ${rule.kind}`;
  const blocked = protectedBlock(message.member, cached.settings.features.protectedRoleIds);
  const harsh = rule.action === "timeout" || rule.action === "kick" || rule.action === "ban";
  if (rule.action !== "kick" && rule.action !== "ban") await message.delete().catch(() => undefined);
  if (blocked && harsh) {
    await logLine(message.guild, cached.settings, "Automod stopped", `${message.author.tag} matched ${rule.kind}, but they have a protected role.`, 0xffb347);
    return;
  }
  if (rule.action === "timeout") {
    await message.member.timeout(rule.timeoutMinutes * 60_000, reason).catch(() => undefined);
  } else if (rule.action === "kick") {
    await message.member.kick(reason).catch(() => undefined);
  } else if (rule.action === "ban") {
    await message.member.ban({ reason, deleteMessageSeconds: 60 * 60 }).catch(() => undefined);
  }
  if (rule.action === "delete") return;
  const modCase = await createCase(client.db, {
    guildId: message.guild.id,
    type: rule.action === "ban" ? "ban" : rule.action === "kick" ? "kick" : rule.action === "timeout" ? "mute" : "warn",
    targetId: message.author.id,
    moderatorId: client.user?.id ?? "knox",
    reason,
    durationMs: rule.action === "timeout" ? rule.timeoutMinutes * 60_000 : null,
    active: rule.action === "timeout" || rule.action === "ban",
  }).catch(() => null);
  await sendModLog(message.guild, cached.settings, {
    title: "Automod rule",
    caseNumber: modCase?.caseNumber ?? 0,
    action: rule.action,
    target: message.author,
    moderator: client.user!,
    reason,
    durationMs: rule.action === "timeout" ? rule.timeoutMinutes * 60_000 : null,
    color: 0xff8a4c,
  });
}

function spamKey(guildId: string, userId: string) {
  return `${guildId}:${userId}`;
}

export async function punish(
  client: KnoxClient,
  message: Message,
  reason: string,
  timeout = true,
) {
  if (!message.guild || !message.member) return;
  const cached = await client.guildConfig.get(message.guild.id);
  if (!cached.settings.moduleFlags.moderation) return;

  await message.delete().catch(() => undefined);

  // a case is only written when the timeout really happened; otherwise the log just records the deletion
  let timedOut = false;
  if (timeout) {
    try {
      await message.member.timeout(10 * 60_000, reason);
      timedOut = true;
    } catch (err) {
      logger.warn({ err }, "automod timeout failed");
    }
  }

  const modCase = timedOut
    ? await createCase(client.db, {
        guildId: message.guild.id,
        type: "mute",
        targetId: message.author.id,
        moderatorId: client.user?.id ?? "knox",
        reason,
        durationMs: 10 * 60_000,
        active: true,
      })
    : null;

  await sendModLog(message.guild, cached.settings, {
    title: timedOut ? "Automod action" : "Automod: message deleted (could not time out)",
    caseNumber: modCase?.caseNumber ?? 0,
    action: timedOut ? "mute" : "delete",
    target: message.author,
    moderator: client.user!,
    reason,
    durationMs: timedOut ? 10 * 60_000 : null,
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

    for (const rule of mod.automodRules) {
      if (!ruleHits(rule, factsFor(message, rule))) continue;
      await applyRule(client, message, rule);
      return;
    }

    if (mod.antiPhishing) {
      // keeps the scam-domain lists fresh (no-op most of the time); the look-alike rules work even before they load
      void refreshPhishList();
      const hit = findPhishingHost(message.content);
      if (hit) {
        await punish(
          client,
          message,
          hit.reason === "listed" ? `Automod: known scam link (${hit.host})` : `Automod: fake-brand link (${hit.host})`,
        );
        return;
      }
    }

    if (mod.aiModeration && message.content.trim().length >= 6) {
      const verdict = await classifyMessage(message.guild.id, message.content);
      if (verdict?.action === "remove") {
        await punish(client, message, `Automod: AI flagged ${verdict.category} (${Math.round(verdict.score * 100)}%)`);
        return;
      }
      if (verdict?.action === "flag") {
        const key = `${message.guild.id}:${message.author.id}`;
        if (Date.now() - (aiFlagNoted.get(key) ?? 0) > 10 * 60_000) {
          aiFlagNoted.set(key, Date.now());
          await logLine(message.guild, settings, "AI flagged, left in place", `${message.author.tag} in <#${message.channelId}> · ${verdict.category} · [jump](${message.url})\n> ${message.content.slice(0, 200)}`, 0xffb347);
        }
      }
    }

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

    // content filters (delete only, no timeout — the warn system and native AutoMod handle repeat offenders)
    if (mod.filterCaps) {
      const letters = message.content.replace(/[^a-zA-Z]/g, "");
      if (letters.length >= 10 && letters.replace(/[^A-Z]/g, "").length / letters.length >= 0.7) {
        await punish(client, message, "Automod: excessive caps", false);
        return;
      }
    }
    if (mod.filterEmoji) {
      const custom = (message.content.match(/<a?:\w+:\d+>/g) ?? []).length;
      const unicode = (message.content.match(/\p{Extended_Pictographic}/gu) ?? []).length;
      if (custom + unicode >= 10) {
        await punish(client, message, "Automod: emoji spam", false);
        return;
      }
    }
    if (mod.filterRepeat) {
      const words = message.content.trim().split(/\s+/);
      if (/(.)\1{14,}/.test(message.content) || (words.length >= 6 && new Set(words.map((w) => w.toLowerCase())).size === 1)) {
        await punish(client, message, "Automod: repeated text", false);
        return;
      }
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
