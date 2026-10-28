import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { KNOX_RANKS, type KnoxRank } from "@knox/shared";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/router.js";
import { rankSetupPayload, saveRankMapping } from "../../../lib/rank-setup.js";

export const setRankRoleCommand: KnoxCommand = {
  moduleId: "admin",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("set-rank-role")
    .setDescription("Map a Discord role to a ZARU rank, or open the staff-role picker")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt
        .setName("rank")
        .setDescription("ZARU rank")
        .addChoices(
          ...KNOX_RANKS.filter((r) => r !== "owner").map((r) => ({
            name: r,
            value: r,
          })),
        ),
    )
    .addRoleOption((opt) =>
      opt.setName("role").setDescription("Discord role"),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;

    const rank = interaction.options.getString("rank") as KnoxRank | null;
    const role = interaction.options.getRole("role");
    if (!rank && !role) {
      await interaction.reply({ ...rankSetupPayload(interaction.guild, ctx.settings?.embedColor), ephemeral: true });
      return;
    }
    if (!rank || !role) {
      await interaction.reply({ content: "Pick both a rank and a role, or run `/set-rank-role` with neither to open the picker.", ephemeral: true });
      return;
    }
    if (role.id === interaction.guild.id) {
      await interaction.reply({ content: "Pick a real role, not @everyone.", ephemeral: true });
      return;
    }
    if (rank === "owner") {
      await interaction.reply({ content: "The server owner is always owner. Map admin, mod, or dj.", ephemeral: true });
      return;
    }

    await saveRankMapping(ctx.client, interaction.guild, rank, role.id);

    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle("Rank mapped")
          .setDescription(`ZARU **${rank}** → ${role}`),
      ],
      ephemeral: true,
    });
  },
};
