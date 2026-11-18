// The Discord side of audit-cases.ts: reads the entry, writes its case once, closes what a lift ends,
// and posts the case to the mod-log like a case from a command.
import type { Guild, GuildAuditLogsEntry } from "discord.js";
import type { GuildSettings } from "@knox/config";
import type { KnoxClient } from "../../../client.js";
import { auditCase, auditCaseLabel, type AuditEntryLike } from "./audit-cases.js";
import { createAuditCase, deactivateActiveBans, deactivateActiveMutes } from "./cases.js";
import { sendModLog } from "./modlog.js";

function plain(entry: GuildAuditLogsEntry): AuditEntryLike {
  return {
    id: entry.id,
    action: entry.action as number,
    targetId: entry.targetId,
    executorId: entry.executorId,
    reason: entry.reason,
    createdTimestamp: entry.createdTimestamp,
    changes: entry.changes.map((change) => ({ key: String(change.key), old: change.old, new: change.new })),
  };
}

/**
 * A timeout, kick, ban or unban done by hand becomes a case. True when a new case was made; ZARU's own
 * actions, other entries, and an entry that already has its case make none.
 */
export async function recordAuditCase(
  client: KnoxClient,
  entry: GuildAuditLogsEntry,
  guild: Guild,
  cached: { settings: GuildSettings; degraded?: boolean },
): Promise<boolean> {
  const botId = client.user?.id;
  if (!botId) return false;
  const made = auditCase(plain(entry), {
    botId,
    enabled: cached.settings.moderation.manualCases,
    settingsLoaded: !cached.degraded,
  });
  if (typeof made === "string") return false;

  const modCase = await createAuditCase(client.db, { guildId: guild.id, ...made });
  if (!modCase) return false;
  // a lift ends whatever was in force
  if (made.type === "unban") await deactivateActiveBans(client.db, guild.id, made.targetId);
  if (made.type === "unmute") await deactivateActiveMutes(client.db, guild.id, made.targetId);

  const [target, moderator] = await Promise.all([
    client.users.fetch(made.targetId).catch(() => null),
    client.users.fetch(made.moderatorId).catch(() => null),
  ]);
  // the case is on the record either way; the post needs both names
  if (!target || !moderator) return true;
  const label = auditCaseLabel(made.type);
  await sendModLog(guild, cached.settings, {
    title: label.title,
    caseNumber: modCase.caseNumber,
    action: label.action,
    target,
    moderator,
    reason: made.reason,
    durationMs: made.durationMs,
  });
  return true;
}
