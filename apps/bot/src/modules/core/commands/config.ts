import { SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/router.js";

export const configCommand: KnoxCommand = {
  moduleId: "core",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("View Knox config for this server"),
  async execute(interaction, ctx) {
    if (!ctx.settings) {
      await interaction.reply({
        content: "No saved settings yet — open the Knox Dashboard once to create them.",
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings.embedColor)
          .setTitle("Server config")
          .addFields(
            { name: "Locale", value: ctx.settings.locale, inline: true },
            { name: "Embed color", value: ctx.settings.embedColor, inline: true },
            {
              name: "Log channel",
              value: ctx.settings.logChannelId
                ? `<#${ctx.settings.logChannelId}>`
                : "not set",
              inline: true,
            },
          ),
      ],
      ephemeral: true,
    });
  },
};
