import { SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/router.js";

export const configCommand: KnoxCommand = {
  moduleId: "core",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Show this server's ZARU settings"),
  async execute(interaction, ctx) {
    // guild commands always get settings (defaults while the database is still answering)
    const s = ctx.settings ?? (await ctx.client.guildConfig.get(interaction.guildId ?? "")).settings;
    const modules = Object.entries(s.moduleFlags)
      .map(([id, on]) => `${on ? "🟢" : "⚫"} ${id}`)
      .join("  ");
    await interaction.reply({
      embeds: [
        knoxEmbed(s.embedColor)
          .setTitle("Server config")
          .addFields(
            { name: "Prefix", value: `\`${s.features.commandPrefix}\``, inline: true },
            { name: "Embed color", value: s.embedColor, inline: true },
            { name: "Log channel", value: s.logChannelId ? `<#${s.logChannelId}>` : "not set", inline: true },
            { name: "Modules", value: modules || "none" },
            {
              name: "Where to change things",
              value: "`/setup` welcome, goodbye, invites, autorole, logs · `/modules` on/off · `/prefix` · `/set-rank-role` · the dashboard",
            },
          ),
      ],
      ephemeral: true,
    });
  },
};
