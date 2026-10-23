import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { fixedName } from "../../../lib/decancer.js";
import { logLine } from "../lib/modlog.js";

export const decancerCommand: KnoxCommand = {
  moduleId: "moderation",
  guildOnly: true,
  requiredRank: "mod",
  data: new SlashCommandBuilder()
    .setName("decancer")
    .setDescription("Make an unreadable nickname readable (zalgo, look-alike letters, symbol spam)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addSubcommand((s) =>
      s
        .setName("user")
        .setDescription("Clean one member's name now")
        .addUserOption((o) => o.setName("user").setDescription("The member").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("auto")
        .setDescription("Clean unreadable names by itself when members join or rename")
        .addBooleanOption((o) => o.setName("enabled").setDescription("On or off").setRequired(true)),
    ),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const cached = await ctx.client.guildConfig.get(guild.id);
    if (interaction.options.getSubcommand() === "auto") {
      const member = guild.members.cache.get(interaction.user.id);
      if (!member?.permissions.has(PermissionFlagsBits.ManageGuild) && interaction.user.id !== guild.ownerId) {
        await interaction.reply({ content: "Switching auto-clean needs Manage Server.", ephemeral: true });
        return;
      }
      const enabled = interaction.options.getBoolean("enabled", true);
      await persistGuildSettings(ctx.client, guild.id, { ...cached.settings, moderation: { ...cached.settings.moderation, autoDecancer: enabled } });
      await interaction.reply({
        content: enabled ? "Unreadable names are fixed by themselves on join and on rename; readable names in any script are left alone." : "Auto-clean is off.",
        ephemeral: true,
      });
      return;
    }
    const user = interaction.options.getUser("user", true);
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      await interaction.reply({ content: "That person isn't in the server.", ephemeral: true });
      return;
    }
    const next = fixedName(member.displayName, true);
    if (!next) {
      await interaction.reply({ content: `**${member.displayName}** is already readable.`, ephemeral: true });
      return;
    }
    if (!member.manageable) {
      await interaction.reply({ content: "I can't rename them: their top role is above mine (or they own the server).", ephemeral: true });
      return;
    }
    const before = member.displayName;
    await member.setNickname(next, `Decancer by ${interaction.user.tag}`);
    await logLine(guild, cached.settings, "Nickname cleaned", `<@${member.id}>: "${before}" → "${next}" by ${interaction.user.tag}`);
    await interaction.reply({ content: `Renamed **${before}** to **${next}**.`, ephemeral: true });
  },
};
