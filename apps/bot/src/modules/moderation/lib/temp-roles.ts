// Temporary roles: the job tick takes back roles whose time is up.
import { and, eq, lte } from "drizzle-orm";
import { tempRoles } from "@knox/db";
import type { KnoxClient } from "../../../client.js";
import { logLine } from "./modlog.js";
import { logger } from "../../../logger.js";

export async function runTempRoles(client: KnoxClient) {
  const due = await client.db.select().from(tempRoles).where(lte(tempRoles.expiresAt, new Date())).limit(50);
  for (const row of due) {
    const claimed = await client.db.delete(tempRoles).where(and(eq(tempRoles.id, row.id), eq(tempRoles.expiresAt, row.expiresAt))).returning({ id: tempRoles.id });
    if (!claimed.length) continue;
    const guild = client.guilds.cache.get(row.guildId);
    if (!guild) continue;
    const member = await guild.members.fetch(row.userId).catch(() => null);
    const role = guild.roles.cache.get(row.roleId);
    let outcome = "they had already left";
    if (member && role) {
      outcome = member.roles.cache.has(role.id)
        ? await member.roles.remove(role, "Temporary role ended").then(() => "removed", () => "could not be removed (permissions)")
        : "they no longer had it";
    } else if (member && !role) {
      outcome = "the role no longer exists";
    }
    const cached = await client.guildConfig.get(guild.id);
    await logLine(guild, cached.settings, "Temporary role ended", `<@${row.userId}> · <@&${row.roleId}> · ${outcome}`).catch((err) =>
      logger.debug({ err }, "temp role log failed"),
    );
  }
}
