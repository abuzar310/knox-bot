import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { eq, and } from "drizzle-orm";
import { guildPermissionRoles, guilds, notifyGuildConfig } from "@knox/db";
import { KNOX_RANKS, type KnoxRank } from "@knox/shared";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/router.js";

export const setRankRoleCommand: KnoxCommand = {
  moduleId: "admin",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("set-rank-role")
    .setDescription("Map a Discord role to a Knox rank")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((opt) =>
      opt
        .setName("rank")
        .setDescription("Knox rank")
        .setRequired(true)
        .addChoices(
          ...KNOX_RANKS.filter((r) => r !== "owner").map((r) => ({
            name: r,
            value: r,
          })),
        ),
    )
    .addRoleOption((opt) =>
      opt.setName("role").setDescription("Discord role").setRequired(true),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;

    const rank = interaction.options.getString("rank", true) as KnoxRank;
    const role = interaction.options.getRole("role", true);

    await ctx.client.db
      .insert(guilds)
      .values({
        id: interaction.guild.id,
        name: interaction.guild.name,
        icon: interaction.guild.icon,
        ownerId: interaction.guild.ownerId,
      })
      .onConflictDoUpdate({
        target: guilds.id,
        set: {
          name: interaction.guild.name,
          icon: interaction.guild.icon,
          ownerId: interaction.guild.ownerId,
        },
      });

    await ctx.client.db
      .delete(guildPermissionRoles)
      .where(
        and(
          eq(guildPermissionRoles.guildId, interaction.guild.id),
          eq(guildPermissionRoles.rank, rank),
        ),
      );

    await ctx.client.db.insert(guildPermissionRoles).values({
      guildId: interaction.guild.id,
      rank,
      roleId: role.id,
    });

    await notifyGuildConfig(ctx.client.pool, interaction.guild.id);
    ctx.client.guildConfig.invalidate(interaction.guild.id);

    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle("Rank mapped")
          .setDescription(`Knox **${rank}** → ${role}`),
      ],
      ephemeral: true,
    });
  },
};
