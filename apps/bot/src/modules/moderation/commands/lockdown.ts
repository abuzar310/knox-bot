// /lockdown: stop everyone writing in every public text channel at once, and open exactly those channels again.
import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, type Guild, type NewsChannel, type TextChannel } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { logLine } from "../lib/modlog.js";

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

export const lockdownCommand: KnoxCommand = {
  moduleId: "moderation",
  guildOnly: true,
  requiredRank: "mod",
  data: new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Lock every public text channel during a raid, and unlock them all later")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((s) =>
      s
        .setName("on")
        .setDescription("Lock all public text channels")
        .addStringOption((o) => o.setName("reason").setDescription("Shown in each channel").setMaxLength(200)),
    )
    .addSubcommand((s) => s.setName("off").setDescription("Unlock the channels the lockdown locked")),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const me = guild.members.me ?? (await guild.members.fetchMe());
    if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({ content: "I need **Manage Channels** for a lockdown.", ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const cached = await ctx.client.guildConfig.get(guild.id);
    const mod = cached.settings.moderation;

    if (interaction.options.getSubcommand() === "on") {
      if (mod.lockdownChannelIds.length) {
        await interaction.editReply("A lockdown is already on. /lockdown off ends it.");
        return;
      }
      const reason = interaction.options.getString("reason")?.trim() || "Lockdown";
      const targets = openChannels(guild).slice(0, MAX_CHANNELS);
      const locked: string[] = [];
      for (const channel of targets) {
        const ok = await channel.permissionOverwrites
          .edit(guild.roles.everyone, { SendMessages: false }, { reason: `Lockdown by ${interaction.user.tag}: ${reason}` })
          .then(() => true, () => false);
        if (!ok) continue;
        locked.push(channel.id);
        await channel.send({ embeds: [knoxEmbed("#ff5c5c").setTitle("🔒 Channel locked").setDescription(reason)] }).catch(() => undefined);
      }
      await persistGuildSettings(ctx.client, guild.id, { ...cached.settings, moderation: { ...mod, lockdownChannelIds: locked } });
      await logLine(guild, cached.settings, "Lockdown on", `${locked.length} channels locked by ${interaction.user.tag} · ${reason}`, 0xff5c5c);
      await interaction.editReply(`Locked ${locked.length} channel${locked.length === 1 ? "" : "s"}. /lockdown off opens them again.`);
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
    await persistGuildSettings(ctx.client, guild.id, { ...cached.settings, moderation: { ...mod, lockdownChannelIds: [] } });
    await logLine(guild, cached.settings, "Lockdown off", `${unlocked} channels unlocked by ${interaction.user.tag}`, 0x3ddc84);
    await interaction.editReply(`Unlocked ${unlocked} channel${unlocked === 1 ? "" : "s"}.`);
  },
};
