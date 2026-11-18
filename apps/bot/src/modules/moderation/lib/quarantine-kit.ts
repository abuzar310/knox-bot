// The rules of quarantine: a role that hides the whole server from a member while the mods decide, used in
// place of most bans. Taken from Kira, Horizon's Discord bot (MIT licence, github.com/horizon-rust/kira,
// src/modcase-kit.js), and reworked for many servers and a database.
// Pure: plain data in and out, so it is tested without Discord (quarantine-kit.test.ts).

export const QUARANTINE_ROLE_NAME = "🔒 Quarantined";
export const APPEAL_CHANNEL_NAME = "appeal";
/** what the role may not do anywhere but in the appeal channel */
export const HIDDEN_PERMISSIONS = [
  "ViewChannel",
  "SendMessages",
  "SendMessagesInThreads",
  "CreatePublicThreads",
  "CreatePrivateThreads",
  "AddReactions",
  "Connect",
  "Speak",
] as const;
/** the longest timed quarantine: the same four weeks Discord allows a timeout */
export const MAX_QUARANTINE_MS = 28 * 24 * 60 * 60_000;

export type RoleLike = { id: string; managed: boolean };

/** the roles a quarantine takes away and remembers: all but @everyone, the quarantine role and those Discord manages */
export function rolesToStrip(roles: readonly RoleLike[], ids: { everyoneId: string; quarantineRoleId: string }): string[] {
  return roles.filter((role) => role.id !== ids.everyoneId && role.id !== ids.quarantineRoleId && !role.managed).map((role) => role.id);
}

/** what a quarantined member holds: the roles Discord manages (a bot's, the booster's: they cannot be taken) and the quarantine role */
export function quarantinedRoleSet(roles: readonly RoleLike[], ids: { everyoneId: string; quarantineRoleId: string }): string[] {
  return [...roles.filter((role) => role.managed && role.id !== ids.everyoneId).map((role) => role.id), ids.quarantineRoleId];
}

/** a second quarantine of the same member adds to the remembered roles: the first list cannot be worked out again */
export function mergeKept(existing: readonly string[], incoming: readonly string[]): string[] {
  return [...new Set([...existing, ...incoming])];
}

/** what a release gives back, and what it cannot (a role deleted since, or one ZARU may not hand out) */
export function rolesToRestore(kept: readonly string[], state: (roleId: string) => "ok" | "gone" | "blocked"): { give: string[]; lost: string[] } {
  const give: string[] = [];
  const lost: string[] = [];
  for (const id of new Set(kept)) (state(id) === "ok" ? give : lost).push(id);
  return { give, lost };
}

/** when a quarantine of this length ends: null for one that lasts until a mod lifts it */
export function quarantineUntil(ms: number | null, now: number): Date | null {
  if (ms === null) return null;
  return new Date(now + Math.min(Math.max(ms, 1000), MAX_QUARANTINE_MS));
}

/** the timed quarantines whose time is up */
export function quarantinesDue<T extends { until: Date | null }>(rows: readonly T[], now: number): T[] {
  return rows.filter((row) => row.until !== null && row.until.getTime() <= now);
}

export type ChannelLike = {
  id: string;
  /** who has an overwrite that explicitly allows viewing the channel: member ids and role ids */
  viewAllowedFor: readonly string[];
};

/**
 * The channels a quarantined member can still see. The role's deny loses to an allow given to the member in person
 * (their ticket, their voice room) and to an allow given to a role they keep (the booster role).
 */
export function stillVisible(channels: readonly ChannelLike[], memberId: string, keptRoleIds: readonly string[], appealChannelId: string | null): string[] {
  const beats = new Set([memberId, ...keptRoleIds]);
  return channels.filter((channel) => channel.id !== appealChannelId && channel.viewAllowedFor.some((id) => beats.has(id))).map((channel) => channel.id);
}

/**
 * Why a role change is refused, when it comes from anywhere but the quarantine code. One rule for every feature
 * that hands out roles (auto-role, sticky roles, level rewards, the shop, role menus, delayed roles, the assistant).
 */
export function roleChangeRefusal(change: {
  /** true inside the quarantine code itself */
  inside: boolean;
  kind: "add" | "remove" | "set";
  roleIds: readonly string[];
  quarantineRoleId: string | null;
  memberQuarantined: boolean;
}): string | null {
  if (change.inside) return null;
  const touchesRole = change.quarantineRoleId !== null && change.roleIds.includes(change.quarantineRoleId);
  if (change.kind === "remove") {
    return touchesRole ? "The Quarantined role is taken off only with /quarantine release." : null;
  }
  if (touchesRole) return "The Quarantined role is given only with /quarantine add.";
  if (change.memberQuarantined) return "That member is quarantined: release them first (/quarantine release).";
  return null;
}

/** how the member is told */
export function quarantineNotice(input: { server: string; reason: string; caseNumber: number; until: Date | null; appealChannelId: string | null }): string {
  const length = input.until ? ` until <t:${Math.floor(input.until.getTime() / 1000)}:f>` : "";
  const appeal = input.appealChannelId ? `\nYou can only see <#${input.appealChannelId}> for now. The moderators can read what you write to them there.` : "";
  return `**${input.server}:** you were quarantined${length} (case #${input.caseNumber}).\nReason: ${(input.reason || "No reason provided").slice(0, 500)}${appeal}`;
}
