// Lockdown: stop everyone writing in every public text channel at once, and open exactly those channels again.
// Reached through /raidmode lockdown on|off and the ZARU assistant ("lock down the server").
import { ChannelType, PermissionFlagsBits, type ChatInputCommandInteraction, type Guild, type NewsChannel, type TextChannel } from "discord.js";
import type { KnoxClient } from "../../../client.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { logLine } from "./modlog.js";

const MAX_CHANNELS = 100;

export type LockdownResult = { ok: true; count: number; message: string } | { ok: false; error: string };

/** text and announcement channels where @everyone may currently write */
function openChannels(guild: Guild): Array<TextChannel | NewsChannel> {
  return [...guild.channels.cache.values()]
    .filter((c): c is TextChannel | NewsChannel => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
    .filter((c) => {
      const everyone = c.permissionsFor(guild.roles.everyone);
      return everyone.has(PermissionFlagsBits.ViewChannel) && everyone.has(PermissionFlagsBits.SendMessages);
    });
}

/** lock (or reopen) every public text channel; `actorTag` is written into the audit reason and the log line */
export async function lockdownGuild(client: KnoxClient, guild: Guild, mode: "on" | "off", reasonRaw: string | null, actorTag: string): Promise<LockdownResult> {
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) return { ok: false, error: "I need **Manage Channels** for a lockdown." };
  const cached = await client.guildConfig.get(guild.id);
  const mod = cached.settings.moderation;

  if (mode === "on") {
    if (mod.lockdownChannelIds.length) return { ok: false, error: "A lockdown is already on. /raidmode lockdown off (or \"ZARU, end the lockdown\") ends it." };
    const reason = reasonRaw?.trim() || "Lockdown";
    const locked: string[] = [];
    for (const channel of openChannels(guild).slice(0, MAX_CHANNELS)) {
      const ok = await channel.permissionOverwrites
        .edit(guild.roles.everyone, { SendMessages: false }, { reason: `Lockdown by ${actorTag}: ${reason}` })
        .then(() => true, () => false);
      if (!ok) continue;
      locked.push(channel.id);
      await channel.send({ embeds: [knoxEmbed("#ff5c5c").setTitle("🔒 Channel locked").setDescription(reason)] }).catch(() => undefined);
    }
    await persistGuildSettings(client, guild.id, { ...cached.settings, moderation: { ...mod, lockdownChannelIds: locked } });
    await logLine(guild, cached.settings, "Lockdown on", `${locked.length} channels locked by ${actorTag} · ${reason}`, 0xff5c5c);
    return { ok: true, count: locked.length, message: `Locked ${locked.length} channel${locked.length === 1 ? "" : "s"}. /raidmode lockdown off opens them again.` };
  }

  if (!mod.lockdownChannelIds.length) return { ok: false, error: "No lockdown is on." };
  let unlocked = 0;
  for (const id of mod.lockdownChannelIds) {
    const channel = guild.channels.cache.get(id);
    if (!channel || channel.isThread() || channel.isDMBased()) continue;
    const ok = await channel.permissionOverwrites
      .edit(guild.roles.everyone, { SendMessages: null }, { reason: `Lockdown ended by ${actorTag}` })
      .then(() => true, () => false);
    if (!ok) continue;
    unlocked++;
    if (channel.isTextBased()) await channel.send({ embeds: [knoxEmbed("#3ddc84").setTitle("🔓 Channel unlocked")] }).catch(() => undefined);
  }
  await persistGuildSettings(client, guild.id, { ...cached.settings, moderation: { ...mod, lockdownChannelIds: [] } });
  await logLine(guild, cached.settings, "Lockdown off", `${unlocked} channels unlocked by ${actorTag}`, 0x3ddc84);
  return { ok: true, count: unlocked, message: `Unlocked ${unlocked} channel${unlocked === 1 ? "" : "s"}.` };
}

/** the interaction must already be deferred (ephemeral) */
export async function runLockdown(interaction: ChatInputCommandInteraction, client: KnoxClient, mode: "on" | "off", reasonRaw: string | null) {
  const guild = interaction.guild;
  if (!guild) return;
  const result = await lockdownGuild(client, guild, mode, reasonRaw, interaction.user.tag);
  await interaction.editReply(result.ok ? result.message : result.error);
}
