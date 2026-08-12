import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/router.js";
import { getUserHistory } from "../lib/cases.js";

export const historyCommand: KnoxCommand = {
  moduleId: "moderation",
  guildOnly: true,
  requiredRank: "mod",
  data: new SlashCommandBuilder()
    .setName("history")
    .setDescription("Show recent moderation cases for a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("User").setRequired(true)),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const user = interaction.options.getUser("user", true);
    const rows = await getUserHistory(
      ctx.client.db,
      interaction.guild.id,
      user.id,
      10,
    );

    if (!rows.length) {
      await interaction.reply({
        content: `No cases for ${user.tag}.`,
        ephemeral: true,
      });
      return;
    }

    const lines = rows.map(
      (c) =>
        `\`#${c.caseNumber}\` **${c.type}** — ${c.reason.slice(0, 80)}${c.reason.length > 80 ? "…" : ""}`,
    );

    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle(`History · ${user.tag}`)
          .setDescription(lines.join("\n")),
      ],
      ephemeral: true,
    });
  },
};
