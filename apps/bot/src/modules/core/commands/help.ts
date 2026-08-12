import { SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";

export const helpCommand: KnoxCommand = {
  moduleId: "core",
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("What Knox can do right now"),
  async execute(interaction, ctx) {
    const modules = [...interaction.client.modules.values()]
      .map((m) => {
        const enabled = ctx.settings?.moduleFlags[m.id as keyof typeof ctx.settings.moduleFlags];
        const mark = enabled === false ? "off" : m.defaultEnabled || enabled ? "on" : "stub";
        return `• **${m.name}** (\`${m.id}\`) — ${m.description} _[${mark}]_`;
      })
      .join("\n");

    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle("Knox")
          .setDescription(
            "Use `/setup start` then `/help`. Levels, tickets, giveaways, starboard, LFG, and more are live.\n\n" +
              modules,
          )
          .setFooter({ text: "/setup view · /invites · dashboard for extra toggles" }),
      ],
    });
  },
};
