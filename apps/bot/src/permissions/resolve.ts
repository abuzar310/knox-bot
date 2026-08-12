import type { GuildMember } from "discord.js";
import { DEFAULT_MODULE_FLAGS, hasMinRank, type KnoxRank, type ModuleId } from "@knox/shared";
import type { GuildSettings } from "@knox/config";
import type {
  CommandOverrideRow,
  KnoxCommand,
  PermissionRoleRow,
} from "../types.js";

export function resolveKnoxRank(
  member: GuildMember,
  permissionRows: PermissionRoleRow[],
): KnoxRank {
  if (member.id === member.guild.ownerId) {
    return "owner";
  }

  let best: KnoxRank = "member";
  const order: KnoxRank[] = ["owner", "admin", "mod", "dj", "member"];

  for (const row of permissionRows) {
    if (!member.roles.cache.has(row.roleId)) continue;
    if (order.indexOf(row.rank) < order.indexOf(best)) {
      best = row.rank;
    }
  }

  return best;
}

function overrideDecision(
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

  const override = overrideDecision(member, command.data.name, overrides);
  if (override === "deny") {
    return { ok: false, reason: "You are blocked from this command." };
  }
  if (override === "allow") {
    return { ok: true };
  }

  const required = command.requiredRank ?? "member";
  const rank = resolveKnoxRank(member, permissionRows);

  if (rank === "owner") {
    return { ok: true };
  }

  if (!hasMinRank(rank, required)) {
    return {
      ok: false,
      reason: `Needs Knox rank **${required}** or higher (you are **${rank}**).`,
    };
  }

  return { ok: true };
}
