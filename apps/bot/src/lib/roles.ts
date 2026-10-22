// Which roles the bot may hand out on its own. Reaction roles, verify, autorole and level rewards give roles to
// whoever asks, so a role that carries moderator powers, belongs to an integration, sits above the bot, or is
// @everyone must be refused when it is configured and skipped when it is granted.
import { PermissionFlagsBits, type Guild, type Role } from "discord.js";

const POWER = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.MentionEveryone,
  PermissionFlagsBits.ManageNicknames,
  PermissionFlagsBits.ManageThreads,
];

/** why this role must not be given out automatically, or null when it is fine */
export function roleGrantProblem(role: Role): string | null {
  if (role.id === role.guild.id) return "that is @everyone";
  if (role.managed) return "that role belongs to an integration and can't be given out";
  if (!role.editable) return "that role is above ZARU's highest role, so ZARU can't give it";
  if (POWER.some((p) => role.permissions.has(p))) return "that role has moderator powers, so ZARU won't hand it out automatically";
  return null;
}

/** the same check from a role id (when a command received an option, or settings hold an id) */
export async function roleIdGrantProblem(guild: Guild, roleId: string): Promise<string | null> {
  const role = await guild.roles.fetch(roleId).catch(() => null);
  if (!role) return "that role doesn't exist any more";
  return roleGrantProblem(role);
}

/** true when the bot may add this role to a member right now (used at grant time, quietly) */
export function canGrantRole(role: Role | null | undefined): role is Role {
  return !!role && roleGrantProblem(role) === null;
}

/** role permission bits copied from a template, minus Administrator: a template never installs an admin role */
export function withoutAdministrator(bits: bigint): bigint {
  return bits & ~PermissionFlagsBits.Administrator;
}
