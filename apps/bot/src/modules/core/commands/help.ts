import { SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { ABOUT_TOPICS, aboutComponents, aboutHelpEmbed, parseAboutTopic } from "../../../lib/about.js";

export const helpCommand: KnoxCommand = {
  moduleId: "core",
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show what Knox can do. Pick a topic for the full command list")
    .addStringOption((o) =>
      o
        .setName("topic")
        .setDescription("A Knox feature to explain")
        .setRequired(false)
        .addChoices(...ABOUT_TOPICS.map((t) => ({ name: t.label, value: t.value }))),
    ),
  async execute(interaction, ctx) {
    const topic = parseAboutTopic(interaction.options.getString("topic"));
    await interaction.reply({
      embeds: [aboutHelpEmbed(topic, ctx.settings?.embedColor)],
      components: aboutComponents(),
    });
  },
};
