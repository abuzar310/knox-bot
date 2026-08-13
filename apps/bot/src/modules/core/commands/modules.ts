import { SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/router.js";

export const modulesCommand: KnoxCommand = {
  moduleId: "core",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("modules")
    .setDescription("See which ZARU features are on in this server"),
  async execute(interaction, ctx) {
    const lines = [...interaction.client.modules.values()].map((m) => {
      const flag = ctx.settings?.moduleFlags[m.id as keyof typeof ctx.settings.moduleFlags];
      const state = flag ?? m.defaultEnabled;
      return `• **${m.name}** — ${state ? "enabled" : "disabled"}`;
    });

    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle("Modules")
          .setDescription(lines.join("\n")),
      ],
    });
  },
};
