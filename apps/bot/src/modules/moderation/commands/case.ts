import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/router.js";
import { getCase } from "../lib/cases.js";
import { formatDuration } from "../lib/duration.js";

export const caseCommand: KnoxCommand = {
  moduleId: "moderation",
  guildOnly: true,
  requiredRank: "mod",
  data: new SlashCommandBuilder()
    .setName("case")
    .setDescription("Look up a moderation case")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addIntegerOption((o) =>
      o.setName("number").setDescription("Case number").setRequired(true).setMinValue(1),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const number = interaction.options.getInteger("number", true);
    const modCase = await getCase(ctx.client.db, interaction.guild.id, number);

    if (!modCase) {
      await interaction.reply({ content: `Case #${number} not found.`, ephemeral: true });
      return;
    }

    const embed = knoxEmbed(ctx.settings?.embedColor)
      .setTitle(`Case #${modCase.caseNumber}`)
      .addFields(
        { name: "Type", value: modCase.type, inline: true },
        { name: "Active", value: modCase.active ? "yes" : "no", inline: true },
        { name: "Target", value: `<@${modCase.targetId}> (\`${modCase.targetId}\`)` },
        {
          name: "Moderator",
          value: `<@${modCase.moderatorId}> (\`${modCase.moderatorId}\`)`,
        },
        { name: "Reason", value: modCase.reason },
      )
      .setTimestamp(modCase.createdAt);

    if (modCase.durationMs) {
      embed.addFields({
        name: "Duration",
        value: formatDuration(modCase.durationMs),
        inline: true,
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
