import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { DEFAULT_RAID_MINUTES, disableRaidMode, enableRaidMode } from "../lib/raid.js";

export const raidmodeCommand: KnoxCommand = {
  moduleId: "moderation",
  guildOnly: true,
  requiredRank: "mod",
  data: new SlashCommandBuilder()
    .setName("raidmode")
    .setDescription("Lock the doors during a raid: invites paused, new joins turned away")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("on")
        .setDescription("Switch raid mode on")
        .addIntegerOption((o) =>
          o.setName("minutes").setDescription(`How long before it switches off by itself (default ${DEFAULT_RAID_MINUTES})`).setMinValue(5).setMaxValue(1440),
        ),
    )
    .addSubcommand((s) => s.setName("off").setDescription("Switch raid mode off now"))
    .addSubcommand((s) => s.setName("status").setDescription("Is raid mode on, and what the join gate is set to")),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const sub = interaction.options.getSubcommand();
    if (sub === "on") {
      const minutes = interaction.options.getInteger("minutes") ?? DEFAULT_RAID_MINUTES;
      await interaction.deferReply({ ephemeral: true });
      const switched = await enableRaidMode(ctx.client, guild, minutes, `switched on by ${interaction.user.tag}`);
      await interaction.editReply(
        switched
          ? `Raid mode is on for ${minutes} minutes: invites paused (if I have Manage Server), new joins turned away. /raidmode off ends it early.`
          : "Raid mode was already on. /raidmode status shows until when.",
      );
      return;
    }
    if (sub === "off") {
      await interaction.deferReply({ ephemeral: true });
      const switched = await disableRaidMode(ctx.client, guild, `switched off by ${interaction.user.tag}`);
      await interaction.editReply(switched ? "Raid mode is off: joins and invites are open again." : "Raid mode wasn't on.");
      return;
    }
    const cached = await ctx.client.guildConfig.get(guild.id);
    const mod = cached.settings.moderation;
    const until = mod.raidModeUntil ? Math.floor(new Date(mod.raidModeUntil).getTime() / 1000) : null;
    const embed = knoxEmbed(cached.settings.embedColor)
      .setTitle(mod.raidMode ? "🔒 Raid mode is ON" : "Raid mode is off")
      .setDescription(mod.raidMode && until ? `Switches off <t:${until}:R> (<t:${until}:t>). /raidmode off ends it now.` : "Joins are open.")
      .addFields(
        { name: "Auto raid mode", value: mod.raidJoinsPerMinute > 0 ? `at ${mod.raidJoinsPerMinute} joins per minute` : "off (/antiraid threshold)", inline: true },
        { name: "Minimum account age", value: mod.joinGateMinAccountAgeHours > 0 ? `${mod.joinGateMinAccountAgeHours} h` : "off (/antiraid joingate)", inline: true },
        { name: "Avatar required", value: mod.joinGateRequireAvatar ? "yes" : "no", inline: true },
        { name: "Anti-phishing", value: mod.antiPhishing ? "on" : "off (/antiraid phishing)", inline: true },
      );
    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
