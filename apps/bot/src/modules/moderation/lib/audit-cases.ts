// Makes a moderation case out of a Discord audit-log entry, so a timeout, kick, ban or unban that a
// moderator (or another bot) does by hand is on the record like one done with a ZARU command.
// The rules follow Kira, Horizon's Discord bot (MIT licence, github.com/horizon-rust/kira, src/modcase-kit.js).
// Pure: plain data in and out, so it is tested without Discord (audit-cases.test.ts).
import type { ModCaseType } from "./cases.js";

/** Discord's audit-log action numbers for the member actions that become cases */
export const AUDIT_ACTION = { kick: 20, ban: 22, unban: 23, memberUpdate: 24 } as const;

export type AuditChangeLike = { key: string; old?: unknown; new?: unknown };

/** the parts of an audit-log entry the rules read */
export type AuditEntryLike = {
  id: string;
  action: number;
  targetId: string | null;
  executorId: string | null;
  reason: string | null;
  createdTimestamp: number;
  changes: readonly AuditChangeLike[];
};

export type AuditCase = {
  type: ModCaseType;
  targetId: string;
  moderatorId: string;
  reason: string;
  durationMs: number | null;
  /** still in force (a ban, a running timeout) or over the moment it happened (a kick, a lift) */
  active: boolean;
  auditEntryId: string;
};

/** why an entry makes no case */
export type AuditSkip = "settings-not-loaded" | "switched-off" | "not-a-case" | "own-action" | "no-target" | "no-moderator";

export const NO_REASON = "No reason given (done by hand in Discord)";

const TIMEOUT_KEY = "communication_disabled_until";
/** Discord's longest timeout: anything beyond it is a clock problem, not a length */
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60_000;

function timeoutChange(entry: AuditEntryLike): { type: "mute"; durationMs: number } | { type: "unmute" } | null {
  const change = entry.changes.find((c) => c.key === TIMEOUT_KEY);
  if (!change) return null;
  const until = typeof change.new === "string" ? Date.parse(change.new) : Number.NaN;
  if (Number.isFinite(until) && until > entry.createdTimestamp) {
    // measured from the entry's own time, not ours: a late event must not shorten the length
    const durationMs = Math.min(MAX_TIMEOUT_MS, Math.round((until - entry.createdTimestamp) / 1000) * 1000);
    return durationMs > 0 ? { type: "mute", durationMs } : null;
  }
  // cleared, or moved to a moment already past: the timeout was taken off
  return change.old ? { type: "unmute" } : null;
}

/** what an audit-log entry is as a case, or why it is none */
export function auditCase(
  entry: AuditEntryLike,
  ctx: { botId: string; enabled: boolean; settingsLoaded: boolean },
): AuditCase | AuditSkip {
  // stand-in settings (a cold cache) say nothing about what this server chose: don't act on them
  if (!ctx.settingsLoaded) return "settings-not-loaded";
  if (!ctx.enabled) return "switched-off";

  let what: { type: ModCaseType; durationMs: number | null; active: boolean } | null = null;
  if (entry.action === AUDIT_ACTION.kick) what = { type: "kick", durationMs: null, active: false };
  else if (entry.action === AUDIT_ACTION.ban) what = { type: "ban", durationMs: null, active: true };
  else if (entry.action === AUDIT_ACTION.unban) what = { type: "unban", durationMs: null, active: false };
  else if (entry.action === AUDIT_ACTION.memberUpdate) {
    const timeout = timeoutChange(entry);
    if (timeout?.type === "mute") what = { type: "mute", durationMs: timeout.durationMs, active: true };
    else if (timeout) what = { type: "unmute", durationMs: null, active: false };
  }
  if (!what) return "not-a-case";

  // ZARU's own commands and filters write their case where they act
  if (entry.executorId === ctx.botId) return "own-action";
  if (!entry.targetId) return "no-target";
  if (!entry.executorId) return "no-moderator";

  const reason = entry.reason?.trim();
  return {
    type: what.type,
    targetId: entry.targetId,
    moderatorId: entry.executorId,
    reason: reason ? reason.slice(0, 1000) : NO_REASON,
    durationMs: what.durationMs,
    active: what.active,
    auditEntryId: entry.id,
  };
}

/** the mod-log title and action word of a case made from the audit log */
export function auditCaseLabel(type: ModCaseType): { title: string; action: string } {
  switch (type) {
    case "mute":
      return { title: "Member timed out (by hand)", action: "Timeout" };
    case "unmute":
      return { title: "Timeout removed (by hand)", action: "Timeout removed" };
    case "kick":
      return { title: "Member kicked (by hand)", action: "Kick" };
    case "ban":
      return { title: "Member banned (by hand)", action: "Ban" };
    case "unban":
      return { title: "Member unbanned (by hand)", action: "Unban" };
    default:
      return { title: "Moderation action (by hand)", action: type };
  }
}

/** who may add evidence to a case: the moderator who acted, or someone who manages the server */
export function evidenceRefusal(
  modCase: { moderatorId: string },
  by: { userId: string; managesServer: boolean; botId: string },
): string | null {
  if (modCase.moderatorId === by.botId && !by.managesServer) return "ZARU acted on this one: only someone who manages the server can add evidence to it.";
  if (modCase.moderatorId !== by.userId && !by.managesServer) return "Only the moderator who acted, or someone who manages the server, can add evidence to this case.";
  return null;
}
