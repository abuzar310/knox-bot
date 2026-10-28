import { PermissionFlagsBits, type GuildMember, type Role } from "discord.js";
import { DEFAULT_MODULE_FLAGS, RANK_ORDER, hasMinRank, type KnoxRank, type ModuleId } from "@knox/shared";
import type { GuildSettings } from "@knox/config";
import type {
  CommandOverrideRow,
  KnoxCommand,
  PermissionRoleRow,
} from "../types.js";

const P = PermissionFlagsBits;

function betterRank(a: KnoxRank, b: KnoxRank): KnoxRank {
  return RANK_ORDER[a] >= RANK_ORDER[b] ? a : b;
}

/** fancy Discord role names ("𝙼𝚘𝚍") become plain letters so we can match them */
export function normalizeRoleName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** guess a ZARU rank from a Discord role name (Moderator, Admin, Staff, DJ…) */
export function guessRankFromRoleName(name: string): KnoxRank | null {
  const n = normalizeRoleName(name);
  if (!n) return null;
  if (/\b(co-?owners?|administrators?|admins?|head\s*admins?|server\s*admins?|management|head\s*staff)\b/.test(n)) return "admin";
  if (/\b(moderators?|trial\s*mods?|head\s*mods?|staff|mods?)\b/.test(n)) return "mod";
  if (/(^|[\s_-])dj([\s_-]|$)/.test(n)) return "dj";
  return null;
}

function rankFromPermissions(member: GuildMember): KnoxRank {
  const perms = member.permissions;
  if (perms.has(P.Administrator)) return "admin";
  if (perms.has(P.ManageGuild)) return "admin";
  if (
    perms.has(P.KickMembers) ||
    perms.has(P.BanMembers) ||
    perms.has(P.ModerateMembers) ||
    perms.has(P.ManageMessages) ||
    perms.has(P.ManageChannels)
  ) {
    return "mod";
  }
  return "member";
}

function roleList(member: GuildMember): Role[] {
  const cache = member.roles?.cache;
  if (!cache || typeof cache.values !== "function") return [];
  return [...cache.values()];
}

export function resolveKnoxRank(
  member: GuildMember,
  permissionRows: PermissionRoleRow[],
): KnoxRank {
  if (member.id === member.guild.ownerId) {
    return "owner";
  }

  // Once the owner has saved an admin or mod role, that list is the staff list.
  // A role named "Staff" or Kick Members alone no longer makes someone a mod.
  // Discord Administrator still counts, so the server isn't locked out of its own bot.
  const staffMapped = permissionRows.some((row) => row.rank === "admin" || row.rank === "mod");
  let best: KnoxRank = "member";
  if (!staffMapped) {
    best = rankFromPermissions(member);
    for (const role of roleList(member)) {
      if (role.id === member.guild.id || role.managed) continue;
      const guessed = guessRankFromRoleName(role.name);
      if (guessed) best = betterRank(best, guessed);
    }
  } else if (member.permissions.has(P.Administrator)) {
    best = "admin";
  }

  for (const row of permissionRows) {
    if (!member.roles.cache.has(row.roleId)) continue;
    best = betterRank(best, row.rank);
  }

  return best;
}

/** what the planner and chat should know about this person */
export function describeAsker(member: GuildMember, rank: KnoxRank) {
  const roles = roleList(member)
    .filter((r) => r.id !== member.guild.id && !r.managed)
    .sort((a, b) => (b.position ?? 0) - (a.position ?? 0))
    .map((r) => r.name)
    .slice(0, 12);
  const powers =
    rank === "owner"
      ? "Owner: any action on this server."
      : rank === "admin"
        ? "Admin: channels, roles, settings, coins, and all moderation."
        : rank === "mod"
          ? "Mod: lock, unlock, kick, ban, warn, timeout, mute, purge, slowmode, pin. Not create/delete channels or roles, not server settings, not giving coins."
          : rank === "dj"
            ? "DJ: music plus member commands. No moderation."
            : "Member: chat by saying zaru, or with the prefix (?zaru). Not the slash command /zaru. Questions and /eco /gamble /lottery /chicken /rank /play (or the same with the prefix). No moderation or server changes.";
  return { rank, roles, powers };
}

export function overrideDecision(
  member: GuildMember,
  commandName: string,
  overrides: CommandOverrideRow[],
): "allow" | "deny" | null {
  const relevant = overrides.filter((o) => o.commandName === commandName);
  let decision: "allow" | "deny" | null = null;

  for (const row of relevant) {
    const matches =
      (row.allowType === "user" && row.allowId === member.id) ||
      (row.allowType === "role" && member.roles.cache.has(row.allowId));
    if (!matches) continue;
    decision = row.effect;
  }

  return decision;
}

export function canRunCommand(input: {
  member: GuildMember | null;
  command: KnoxCommand;
  settings: GuildSettings | null;
  permissionRows: PermissionRoleRow[];
  overrides: CommandOverrideRow[];
}): { ok: true } | { ok: false; reason: string } {
  const { member, command, settings, permissionRows, overrides } = input;

  if (command.guildOnly && !member) {
    return { ok: false, reason: "This command only works in a server." };
  }

  const flags = settings?.moduleFlags ?? DEFAULT_MODULE_FLAGS;
  const moduleId = command.moduleId as ModuleId;
  if (flags[moduleId] === false) {
    return { ok: false, reason: `Module \`${command.moduleId}\` is disabled here.` };
  }

  if (!member) {
    return { ok: true };
  }

  // The server owner can always run a command, even if a role they wear is denied.
  if (member.id === member.guild.ownerId) {
    return { ok: true };
  }

  const override = overrideDecision(member, command.data.name, overrides);
  if (override === "deny") {
    return { ok: false, reason: "You are blocked from this command." };
  }
  if (override === "allow") {
    return { ok: true };
  }

  const required = command.requiredRank ?? "member";
  const rank = resolveKnoxRank(member, permissionRows);

  if (!hasMinRank(rank, required)) {
    return {
      ok: false,
      reason: `Needs ZARU rank **${required}** or higher (you are **${rank}**).`,
    };
  }

  return { ok: true };
}
