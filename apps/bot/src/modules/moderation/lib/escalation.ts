// Warn escalation: when a member reaches a configured number of warns inside the window, ZARU acts on its own —
// timeout, kick or ban — so staff don't have to track warn counts by hand. Called right after each warn is recorded.
import { and, eq, gte } from "drizzle-orm";
import type { Guild, GuildMember } from "discord.js";
import { modCases } from "@knox/db";
import type { GuildSettings } from "@knox/config";
import type { KnoxClient } from "../../../client.js";
import { createCase } from "./cases.js";
import { logLine, notifyTarget } from "./modlog.js";

/** returns a short note to append to the warn reply, or null when nothing was triggered */
export async function applyWarnEscalation(client: KnoxClient, guild: Guild, member: GuildMember | null, settings: GuildSettings): Promise<string | null> {
  const mod = settings.moderation;
  if (!mod.warnEscalation || !member) return null;

  const since = new Date(Date.now() - mod.warnWindowDays * 86_400_000);
  const rows = await client.db
    .select({ id: modCases.id })
    .from(modCases)
    .where(and(eq(modCases.guildId, guild.id), eq(modCases.targetId, member.id), eq(modCases.type, "warn"), gte(modCases.createdAt, since)));
  const count = rows.length;

  // act the moment a threshold is reached (exact match), most severe first
  const action: "ban" | "kick" | "mute" | null =
    mod.warnBanAt > 0 && count === mod.warnBanAt ? "ban" : mod.warnKickAt > 0 && count === mod.warnKickAt ? "kick" : mod.warnMuteAt > 0 && count === mod.warnMuteAt ? "mute" : null;
  if (!action) return null;

  const reason = `Auto: reached ${count} warns in ${mod.warnWindowDays} days`;
  const by = client.user?.id ?? "knox";
  try {
    if (action === "ban") {
      if (!member.bannable) return `· reached ${count} warns but I couldn't auto-ban (their role is above mine)`;
      await notifyTarget(member.user, guild, "banned", reason);
      await member.ban({ reason });
      await createCase(client.db, { guildId: guild.id, type: "ban", targetId: member.id, moderatorId: by, reason });
    } else if (action === "kick") {
      if (!member.kickable) return `· reached ${count} warns but I couldn't auto-kick (their role is above mine)`;
      await notifyTarget(member.user, guild, "kicked", reason);
      await member.kick(reason);
      await createCase(client.db, { guildId: guild.id, type: "kick", targetId: member.id, moderatorId: by, reason });
    } else {
      if (!member.moderatable) return `· reached ${count} warns but I couldn't auto-mute (their role is above mine)`;
      const ms = mod.warnMuteMinutes * 60_000;
      await notifyTarget(member.user, guild, "timed out", reason, ms);
      await member.timeout(ms, reason);
      await createCase(client.db, { guildId: guild.id, type: "mute", targetId: member.id, moderatorId: by, reason, durationMs: ms, active: true });
    }
  } catch {
    return null;
  }
  await logLine(guild, settings, "Warn escalation", `${member.user.tag} hit ${count} warns → auto-${action}`, 0xff8a4c).catch(() => undefined);
  return action === "mute" ? `· auto-muted for ${mod.warnMuteMinutes} min (${count} warns)` : `· auto-${action === "ban" ? "banned" : "kicked"} (${count} warns)`;
}
