// Anti-nuke: if one person (even an admin) or a hacked bot does too many destructive actions in a minute —
// deleting channels or roles, banning, kicking, or creating webhooks — ZARU stops them before the server is wrecked.
// It reads the audit log, so it knows WHO did each action, and only acts when the count passes the configured limit.
import { AuditLogEvent, PermissionFlagsBits, type Guild, type GuildAuditLogsEntry, type GuildMember } from "discord.js";
import type { GuildSettings } from "@knox/config";
import type { KnoxClient } from "../client.js";
import { logger } from "../logger.js";
import { logLine } from "../modules/moderation/lib/modlog.js";

type Kind = "channel" | "role" | "ban" | "kick" | "webhook";

/** which audit actions count, and under which limit; create and delete both count (mass-create is a nuke tactic too) */
const KIND_OF: Partial<Record<AuditLogEvent, Kind>> = {
  [AuditLogEvent.ChannelCreate]: "channel",
  [AuditLogEvent.ChannelDelete]: "channel",
  [AuditLogEvent.RoleCreate]: "role",
  [AuditLogEvent.RoleDelete]: "role",
  [AuditLogEvent.MemberBanAdd]: "ban",
  [AuditLogEvent.MemberKick]: "kick",
  [AuditLogEvent.WebhookCreate]: "webhook",
};

const limitFor = (mod: GuildSettings["moderation"], kind: Kind): number =>
  kind === "channel" ? mod.antiNukeChannelLimit : kind === "role" ? mod.antiNukeRoleLimit : kind === "ban" ? mod.antiNukeBanLimit : kind === "kick" ? mod.antiNukeKickLimit : mod.antiNukeWebhookLimit;

const WINDOW_MS = 60_000;
const PUNISH_COOLDOWN_MS = 5 * 60_000;

/** called for every audit-log entry; returns silently unless a limit is crossed */
export async function guardAgainstNuke(client: KnoxClient, entry: GuildAuditLogsEntry, guild: Guild, settings: GuildSettings) {
  const mod = settings.moderation;
  if (!mod.antiNuke) return;
  const kind = KIND_OF[entry.action as AuditLogEvent];
  if (!kind) return;
  const executorId = entry.executorId;
  if (!executorId) return;
  // never act on the server owner, ZARU itself, or trusted accounts
  if (executorId === guild.ownerId || executorId === client.user?.id || mod.antiNukeWhitelist.includes(executorId)) return;

  const key = `${guild.id}:${executorId}:${kind}`;
  const now = Date.now();
  const recent = (client.nukeActions.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  client.nukeActions.set(key, recent);

  const limit = limitFor(mod, kind);
  if (limit <= 0 || recent.length < limit) return;

  const punishKey = `${guild.id}:${executorId}`;
  if (now - (client.nukePunished.get(punishKey) ?? 0) < PUNISH_COOLDOWN_MS) return;
  client.nukePunished.set(punishKey, now);

  await punish(client, guild, executorId, kind, recent.length, settings).catch((err) => logger.error({ err, guildId: guild.id, executorId }, "anti-nuke punishment failed"));
}

const WORD: Record<Kind, string> = { channel: "deleting/creating channels", role: "deleting/creating roles", ban: "banning members", kick: "kicking members", webhook: "creating webhooks" };

async function punish(client: KnoxClient, guild: Guild, executorId: string, kind: Kind, count: number, settings: GuildSettings) {
  const mod = settings.moderation;
  const action = mod.antiNukeAction;
  const member: GuildMember | null = await guild.members.fetch(executorId).catch(() => null);
  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  const reason = `Anti-nuke: ${count} × ${WORD[kind]} in under a minute`;
  const tag = member?.user.tag ?? executorId;
  let outcome: string;

  if (!member) {
    outcome = `couldn't act: <@${executorId}> already left`;
  } else if (member.id === guild.ownerId) {
    outcome = "it's the server owner, so I left them alone";
  } else if (me && member.roles.highest.comparePositionTo(me.roles.highest) >= 0) {
    // the attacker outranks the bot (e.g. an owner-level role) — ZARU can't touch them, so just raise the alarm loudly
    outcome = `⚠️ I can't stop <@${executorId}>: their top role is above mine. Move ZARU's role up or remove their role now.`;
  } else if (action === "ban" && member.bannable) {
    await member.ban({ reason }).catch(() => undefined);
    outcome = `banned <@${executorId}>`;
  } else if (action === "kick" && member.kickable) {
    await member.kick(reason).catch(() => undefined);
    outcome = `kicked <@${executorId}>`;
  } else {
    // "strip" (the default), or a ban/kick we can't do: take away every role ZARU can remove
    const removable = member.roles.cache.filter((r) => r.id !== guild.id && !r.managed && me !== null && r.comparePositionTo(me.roles.highest) < 0);
    await member.roles.remove(removable, reason).catch(() => undefined);
    outcome = `stripped ${removable.size} role${removable.size === 1 ? "" : "s"} from <@${executorId}> (their powers are gone)`;
  }

  logger.warn({ guildId: guild.id, executorId, kind, count, outcome }, "anti-nuke triggered");
  await logLine(guild, settings, "🛡️ Anti-nuke", `**${tag}** was ${WORD[kind]} fast (${count} in a minute). ${outcome}.`, 0xff3b30).catch(() => undefined);

  // always tell the owner directly, even if the log channel is the thing being nuked
  const owner = await guild.fetchOwner().catch(() => null);
  await owner?.send(`🛡️ **Anti-nuke on ${guild.name}:** ${tag} was ${WORD[kind]} fast (${count} in a minute). ${outcome}.`).catch(() => undefined);
}
