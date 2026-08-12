import { SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";

export const pingCommand: KnoxCommand = {
  moduleId: "core",
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check if Knox is awake"),
  async execute(interaction, ctx) {
    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor).setTitle("Pong").setDescription("Knox is online."),
      ],
    });
    const latency = Date.now() - interaction.createdTimestamp;
    await interaction.editReply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle("Pong")
          .setDescription(`Websocket: ${interaction.client.ws.ping}ms · Round trip: ${latency}ms`),
      ],
    });
  },
};
