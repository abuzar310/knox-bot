import { and, eq } from "drizzle-orm";
import type { GuildMember } from "discord.js";
import { stickyRoles } from "@knox/db";
import type { KnoxClient } from "../../../client.js";
import { canGrantRole } from "../../../lib/roles.js";
import { stickyRoleNames, stickyStillValid } from "./join-roles.js";

export async function saveStickyRoles(client: KnoxClient, member: GuildMember) {
  // a partial member only shows @everyone; saving that would wipe the real set
  if (member.roles.cache.size <= 1) return;
  const names = stickyRoleNames();
  const roleIds = [...member.roles.cache.filter((role) => names.has(role.name.toLowerCase()) && canGrantRole(role)).keys()];
  await client.db
    .insert(stickyRoles)
    .values({ guildId: member.guild.id, userId: member.id, roleIds, leftAt: new Date() })
    .onConflictDoUpdate({
      target: [stickyRoles.guildId, stickyRoles.userId],
      set: { roleIds, leftAt: new Date() },
    });
}

export async function restoreStickyRoles(client: KnoxClient, member: GuildMember) {
  const [row] = await client.db
    .select()
    .from(stickyRoles)
    .where(and(eq(stickyRoles.guildId, member.guild.id), eq(stickyRoles.userId, member.id)))
    .limit(1);
  if (!row) return;
  if (!stickyStillValid(row.leftAt)) {
    await client.db.delete(stickyRoles).where(and(eq(stickyRoles.guildId, member.guild.id), eq(stickyRoles.userId, member.id)));
    return;
  }
  const names = stickyRoleNames();
  for (const roleId of row.roleIds) {
    const role = member.guild.roles.cache.get(roleId) ?? (await member.guild.roles.fetch(roleId).catch(() => null));
    if (!role || !names.has(role.name.toLowerCase()) || !canGrantRole(role) || member.roles.cache.has(role.id)) continue;
    await member.roles.add(role, "Sticky role, back within 30 days").catch(() => undefined);
  }
}
