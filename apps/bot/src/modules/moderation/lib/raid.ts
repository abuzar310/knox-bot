// Raid mode: invites paused and new joins turned away, switched on by a moderator or by a burst of joins, and off
// again by hand or when its time is up (the job tick checks).
import { PermissionFlagsBits, type Guild } from "discord.js";
import type { KnoxClient } from "../../../client.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { logLine } from "./modlog.js";

export const DEFAULT_RAID_MINUTES = 30;

/** true when raid mode was switched on now; false when it already was */
export async function enableRaidMode(client: KnoxClient, guild: Guild, minutes: number, why: string, tellOwner = false): Promise<boolean> {
  const cached = await client.guildConfig.get(guild.id);
  if (cached.settings.moderation.raidMode) return false;
  const until = new Date(Date.now() + minutes * 60_000);
  await persistGuildSettings(client, guild.id, {
    ...cached.settings,
    moderation: { ...cached.settings.moderation, raidMode: true, raidModeUntil: until.toISOString() },
  });
  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  const paused = me?.permissions.has(PermissionFlagsBits.ManageGuild)
    ? await guild.disableInvites(true).then(() => true, () => false)
    : false;
  const stamp = Math.floor(until.getTime() / 1000);
  await logLine(
    guild,
    cached.settings,
    "Raid mode on",
    `${why}. New joins are turned away${paused ? " and invites are paused" : " (invites could not be paused: Manage Server missing)"} until <t:${stamp}:t> (<t:${stamp}:R>). /raidmode off ends it early.`,
    0xff5c5c,
  );
  if (tellOwner) {
    const owner = await guild.fetchOwner().catch(() => null);
    await owner
      ?.send({
        content: `**${guild.name}**: ZARU switched raid mode on (${why}). New joins are turned away${paused ? " and invites are paused" : ""} for ${minutes} minutes. Use /raidmode off in the server to end it early, or /raidmode status to check.`,
        allowedMentions: { parse: [] },
      })
      .catch(() => undefined);
  }
  return true;
}

export async function disableRaidMode(client: KnoxClient, guild: Guild, why: string): Promise<boolean> {
  const cached = await client.guildConfig.get(guild.id);
  if (!cached.settings.moderation.raidMode) return false;
  await persistGuildSettings(client, guild.id, {
    ...cached.settings,
    moderation: { ...cached.settings.moderation, raidMode: false, raidModeUntil: null },
  });
  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  const resumed = me?.permissions.has(PermissionFlagsBits.ManageGuild)
    ? await guild.disableInvites(false).then(() => true, () => false)
    : false;
  await logLine(guild, cached.settings, "Raid mode off", `${why}. Joins are open again${resumed ? " and invites work" : ""}.`, 0x3ddc84);
  return true;
}
