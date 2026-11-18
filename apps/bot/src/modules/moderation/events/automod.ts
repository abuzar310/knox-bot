import { Events, PermissionFlagsBits, type Message, type PartialMessage } from "discord.js";
import type { GuildSettings } from "@knox/config";
import type { KnoxClient } from "../../../client.js";
import type { KnoxBoundEvent, KnoxEvent } from "../../../types.js";
import { createCase } from "../lib/cases.js";
import { sendModLog } from "../lib/modlog.js";
import { logger } from "../../../logger.js";
import { findPhishingHost, refreshPhishList } from "../../../lib/safety/phish-list.js";
import { classifyMessage } from "../../../lib/ai-moderation.js";
import { logLine } from "../lib/modlog.js";
import { protectedBlock } from "../lib/modlog.js";
import { ruleHits, type AutomodRule, type MessageFacts } from "../../../lib/automod-rules.js";
import { NOTICE_GAP_MS, NOTICE_SHOWN_MS, isRealEdit, makeOncePer, newAccountLink, newAccountNotice } from "../lib/automod-kit.js";

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

/** an edited message: only its text is new, so nothing is counted for it and an edit is never spam or a repeat */
function editFacts(message: Message): MessageFacts {
  return {
    content: message.content,
    channelId: message.channelId,
    roleIds: [...message.member!.roles.cache.keys()],
    mentionCount: 0,
    attachmentCount: 0,
    recentCount: 0,
    recentDuplicate: false,
  };
}

/** counts a message toward the flood limit: six in seven seconds is a timeout */
async function countSpam(client: KnoxClient, message: Message) {
  if (!message.guild) return;
  const key = spamKey(message.guild.id, message.author.id);
  const now = Date.now();
  const bucket = spamMap.get(key);
  if (!bucket || now - bucket.firstAt > 7_000) {
    spamMap.set(key, { count: 1, firstAt: now });
    return;
  }
  bucket.count += 1;
  if (bucket.count >= 6) {
    spamMap.delete(key);
    await punish(client, message, "Automod: message spam");
  }
}

const linkNoticeDue = makeOncePer(NOTICE_GAP_MS);

/** deletes a link from an account too young to post one, and tells the member why: once, and briefly */
async function removeNewAccountLink(message: Message, settings: GuildSettings, days: number, edited: boolean) {
  if (!message.guild) return;
  // 10008: the message is already gone, which is as good
  const gone = await message.delete().then(
    () => true,
    (err: { code?: number }) => err?.code === 10008,
  );
  if (!gone) {
    logger.warn({ guildId: message.guild.id, channelId: message.channelId }, "a new account's link could not be deleted");
    return;
  }
  if (!linkNoticeDue(`${message.guild.id}:${message.author.id}`)) return;
  if ("send" in message.channel) {
    const note = await message.channel
      .send({ content: newAccountNotice(message.author.id, message.author.createdTimestamp, days), allowedMentions: { users: [message.author.id] } })
      .catch(() => null);
    if (note) setTimeout(() => void note.delete().catch(() => undefined), NOTICE_SHOWN_MS).unref();
  }
  const made = Math.floor(message.author.createdTimestamp / 1000);
  const said = message.content.slice(0, 300).replace(/`/g, "'");
  await logLine(
    message.guild,
    settings,
    "Link from a new account removed",
    `${message.author.tag} (<@${message.author.id}>) in <#${message.channelId}>${edited ? ", edited into a message" : ""} · account made <t:${made}:R> · links are allowed after ${days} day${days === 1 ? "" : "s"}\n\`\`\`\n${said}\n\`\`\``,
    0xff8a4c,
  );
}

/**
 * Every check on one message. An edited message gets the checks that read the text alone: nothing is counted
 * for it, so an edit is never spam and never a repeat.
 */
async function inspect(message: Message, edited: boolean): Promise<void> {
  if (!message.guild || message.author.bot || !message.member) return;
  if (message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  const client = message.client as KnoxClient;
  if (!client.guildConfig) return;

  const cached = await client.guildConfig.get(message.guild.id);
  const settings = cached.settings;
  if (!settings.moduleFlags.moderation) return;

  const mod = settings.moderation;
  if (mod.ignoredChannelIds.includes(message.channelId)) return;
  // the trap channel has its own handler (events/honeypot.ts): one punishment, not two
  if (mod.honeypotChannelId && message.channelId === mod.honeypotChannelId) return;

  for (const rule of mod.automodRules) {
    if (!ruleHits(rule, edited ? editFacts(message) : factsFor(message, rule))) continue;
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

  // a link from an account too young to post one: deleted with a word to the member, no timeout
  if (newAccountLink({ content: message.content, accountCreatedAt: message.author.createdTimestamp, now: Date.now(), days: mod.newAccountLinkDays })) {
    await removeNewAccountLink(message, settings, mod.newAccountLinkDays, edited);
    // a flood of them is still a flood
    if (mod.antiSpam && !edited) await countSpam(client, message);
    return;
  }

  if (
    !edited &&
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

  if (mod.antiSpam && !edited) await countSpam(client, message);
}

export const automodEvent: KnoxEvent<typeof Events.MessageCreate> = {
  name: Events.MessageCreate,
  async execute(message) {
    await inspect(message, false);
  },
};

/** the same checks when a member changes a message: a link or an invite can't be edited in afterwards */
export const automodEditEvent: KnoxBoundEvent = {
  name: Events.MessageUpdate,
  async execute(...args: unknown[]) {
    const before = args[0] as Message | PartialMessage;
    const after = args[1] as Message | PartialMessage;
    if (!after.guild || after.author?.bot) return;
    const real = isRealEdit({
      editedAt: after.editedTimestamp,
      now: Date.now(),
      oldContent: before.partial ? null : before.content,
      newContent: after.partial ? null : after.content,
    });
    if (!real) return;
    const message = after.partial ? await after.fetch().catch(() => null) : after;
    if (!message?.guild || message.author.bot) return;
    // who is staff is read from the member: when there is none to read, inspect() does nothing
    if (!message.member) await message.guild.members.fetch(message.author.id).catch(() => null);
    await inspect(message, true);
  },
};
