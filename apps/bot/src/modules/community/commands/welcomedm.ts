import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { persistGuildSettings } from "../../../config/save-settings.js";

export const welcomeDmCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("welcomedm")
    .setDescription("Send new members a private welcome message")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("The message; {user} {username} {server} {membercount} are filled in")
        .addStringOption((o) => o.setName("message").setDescription("What to send").setRequired(true).setMaxLength(1800)),
    )
    .addSubcommand((s) => s.setName("off").setDescription("Stop sending welcome DMs")),
  async execute(interaction, ctx) {
    if (!interaction.guild || !ctx.settings) return;
    const message = interaction.options.getSubcommand() === "set" ? interaction.options.getString("message", true).trim() : null;
    await persistGuildSettings(ctx.client, interaction.guild.id, { ...ctx.settings, community: { ...ctx.settings.community, welcomeDmMessage: message } });
    await interaction.reply({ content: message ? "New members get that message by DM when they join (if their DMs are open)." : "Welcome DMs are off.", ephemeral: true });
  },
};
