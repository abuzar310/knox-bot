// Lockdown: stop everyone writing in every public text channel at once, and open exactly those channels again.
// Reached through /raidmode lockdown on|off.
import { ChannelType, PermissionFlagsBits, type ChatInputCommandInteraction, type Guild, type NewsChannel, type TextChannel } from "discord.js";
import type { KnoxClient } from "../../../client.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { logLine } from "./modlog.js";

const MAX_CHANNELS = 100;

/** text and announcement channels where @everyone may currently write */
function openChannels(guild: Guild): Array<TextChannel | NewsChannel> {
  return [...guild.channels.cache.values()]
    .filter((c): c is TextChannel | NewsChannel => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
    .filter((c) => {
      const everyone = c.permissionsFor(guild.roles.everyone);
      return everyone.has(PermissionFlagsBits.ViewChannel) && everyone.has(PermissionFlagsBits.SendMessages);
    });
}

/** the interaction must already be deferred (ephemeral) */
export async function runLockdown(interaction: ChatInputCommandInteraction, client: KnoxClient, mode: "on" | "off", reasonRaw: string | null) {
  const guild = interaction.guild;
  if (!guild) return;
  const me = guild.members.me ?? (await guild.members.fetchMe());
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.editReply("I need **Manage Channels** for a lockdown.");
    return;
  }
  const cached = await client.guildConfig.get(guild.id);
  const mod = cached.settings.moderation;

  if (mode === "on") {
    if (mod.lockdownChannelIds.length) {
      await interaction.editReply("A lockdown is already on. /raidmode lockdown off ends it.");
      return;
    }
    const reason = reasonRaw?.trim() || "Lockdown";
    const locked: string[] = [];
    for (const channel of openChannels(guild).slice(0, MAX_CHANNELS)) {
      const ok = await channel.permissionOverwrites
        .edit(guild.roles.everyone, { SendMessages: false }, { reason: `Lockdown by ${interaction.user.tag}: ${reason}` })
        .then(() => true, () => false);
      if (!ok) continue;
      locked.push(channel.id);
      await channel.send({ embeds: [knoxEmbed("#ff5c5c").setTitle("🔒 Channel locked").setDescription(reason)] }).catch(() => undefined);
    }
    await persistGuildSettings(client, guild.id, { ...cached.settings, moderation: { ...mod, lockdownChannelIds: locked } });
    await logLine(guild, cached.settings, "Lockdown on", `${locked.length} channels locked by ${interaction.user.tag} · ${reason}`, 0xff5c5c);
    await interaction.editReply(`Locked ${locked.length} channel${locked.length === 1 ? "" : "s"}. /raidmode lockdown off opens them again.`);
    return;
  }

  if (!mod.lockdownChannelIds.length) {
    await interaction.editReply("No lockdown is on.");
    return;
  }
  let unlocked = 0;
  for (const id of mod.lockdownChannelIds) {
    const channel = guild.channels.cache.get(id);
    if (!channel || channel.isThread() || channel.isDMBased()) continue;
    const ok = await channel.permissionOverwrites
      .edit(guild.roles.everyone, { SendMessages: null }, { reason: `Lockdown ended by ${interaction.user.tag}` })
      .then(() => true, () => false);
    if (!ok) continue;
    unlocked++;
    if (channel.isTextBased()) await channel.send({ embeds: [knoxEmbed("#3ddc84").setTitle("🔓 Channel unlocked")] }).catch(() => undefined);
  }
  await persistGuildSettings(client, guild.id, { ...cached.settings, moderation: { ...mod, lockdownChannelIds: [] } });
  await logLine(guild, cached.settings, "Lockdown off", `${unlocked} channels unlocked by ${interaction.user.tag}`, 0x3ddc84);
  await interaction.editReply(`Unlocked ${unlocked} channel${unlocked === 1 ? "" : "s"}.`);
}
