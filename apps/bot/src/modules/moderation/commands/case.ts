import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { and, eq } from "drizzle-orm";
import { modCases } from "@knox/db";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/router.js";
import { getCase } from "../lib/cases.js";
import { formatDuration } from "../lib/duration.js";
import { logLine } from "../lib/modlog.js";

export const caseCommand: KnoxCommand = {
  moduleId: "moderation",
  guildOnly: true,
  requiredRank: "mod",
  data: new SlashCommandBuilder()
    .setName("case")
    .setDescription("Look up or correct a moderation case")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) =>
      s
        .setName("view")
        .setDescription("Show a case")
        .addIntegerOption((o) => o.setName("number").setDescription("Case number").setRequired(true).setMinValue(1)),
    )
    .addSubcommand((s) =>
      s
        .setName("edit")
        .setDescription("Change the reason on a case")
        .addIntegerOption((o) => o.setName("number").setDescription("Case number").setRequired(true).setMinValue(1))
        .addStringOption((o) => o.setName("reason").setDescription("New reason").setRequired(true).setMaxLength(500)),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const number = interaction.options.getInteger("number", true);
    const modCase = await getCase(ctx.client.db, interaction.guild.id, number);
    if (!modCase) {
      await interaction.reply({ content: `Case #${number} not found.`, ephemeral: true });
      return;
    }

    if (interaction.options.getSubcommand() === "edit") {
      const reason = interaction.options.getString("reason", true);
      await ctx.client.db
        .update(modCases)
        .set({ reason })
        .where(and(eq(modCases.guildId, interaction.guild.id), eq(modCases.caseNumber, number)));
      await interaction.reply({ content: `Case #${number}: reason updated.`, ephemeral: true });
      await logLine(interaction.guild, ctx.settings, "Case edited", `${interaction.user.tag} changed the reason on case #${number} to: ${reason}`);
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
        { name: "Reason", value: modCase.reason.slice(0, 1000) },
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
