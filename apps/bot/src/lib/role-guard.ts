// One gate for every role change ZARU makes to a member, so a quarantine holds whatever feature asks: nothing
// but the quarantine code gives or takes the Quarantined role, and a quarantined member gets no other role
// until released (auto-role, sticky roles, level rewards, the shop, role menus, delayed roles, the assistant).
// It wraps discord.js's own role methods once at start-up: a guard at each call site would miss the next one.
import { AsyncLocalStorage } from "node:async_hooks";
import { GuildMemberRoleManager } from "discord.js";
import { roleChangeRefusal } from "../modules/moderation/lib/quarantine-kit.js";

const inside = new AsyncLocalStorage<true>();
/** server id -> its quarantine role */
const roleOf = new Map<string, string>();
/** "server:member" of everyone quarantined now, also while they are away */
const held = new Set<string>();

/** a role change stopped by the gate; its message can be shown to a moderator */
export class QuarantineGuardError extends Error {}

/** runs the quarantine code's own role changes past the gate */
export function asQuarantine<T>(work: () => Promise<T>): Promise<T> {
  return inside.run(true, work);
}

export function setQuarantineRole(guildId: string, roleId: string | null) {
  if (roleId) roleOf.set(guildId, roleId);
  else roleOf.delete(guildId);
}

export function quarantineRoleOf(guildId: string): string | null {
  return roleOf.get(guildId) ?? null;
}

export function markQuarantined(guildId: string, userId: string, on: boolean) {
  if (on) held.add(`${guildId}:${userId}`);
  else held.delete(`${guildId}:${userId}`);
}

export function isQuarantined(guildId: string, userId: string): boolean {
  return held.has(`${guildId}:${userId}`);
}

/** the role ids in whatever discord.js accepts: an id, a role, a list, or a collection keyed by id */
export function roleIdsOf(input: unknown): string[] {
  if (input == null) return [];
  if (typeof input === "string") return [input];
  if (input instanceof Map) return [...input.keys()].map(String);
  if (Array.isArray(input)) return input.flatMap(roleIdsOf);
  if (typeof input === "object" && "id" in input) return [String((input as { id: unknown }).id)];
  return [];
}

/** what the gate reads of the role manager it is called on */
type Managed = { guild: { id: string }; member: { id: string } };
type RoleMethod = (this: Managed, roles: unknown, reason?: string) => Promise<unknown>;
type RoleMethods = Record<"add" | "remove" | "set", RoleMethod>;
const installed = new WeakSet<object>();

/**
 * Puts the gate in front of roles.add, roles.remove and roles.set; safe to call more than once. `proto` is
 * discord.js's role manager unless a test hands in its own.
 */
export function installRoleGuard(proto: RoleMethods = GuildMemberRoleManager.prototype as unknown as RoleMethods) {
  if (installed.has(proto)) return;
  installed.add(proto);
  for (const kind of ["add", "remove", "set"] as const) {
    const original = proto[kind];
    proto[kind] = function (this: Managed, roles: unknown, reason?: string) {
      const guildId = this.guild.id;
      const refusal = roleChangeRefusal({
        inside: inside.getStore() === true,
        kind,
        roleIds: roleIdsOf(roles),
        quarantineRoleId: roleOf.get(guildId) ?? null,
        memberQuarantined: held.has(`${guildId}:${this.member.id}`),
      });
      if (refusal) return Promise.reject(new QuarantineGuardError(refusal));
      return original.call(this, roles, reason);
    };
  }
}
