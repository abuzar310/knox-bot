import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { and, eq } from "drizzle-orm";
import { levelRewards, memberProfiles } from "@knox/db";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { getProfile, levelFromXp, xpForLevel } from "../../../lib/profiles.js";
import { topXp } from "../../../lib/xp.js";

export const rankCommand: KnoxCommand = {
  moduleId: "levels",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show XP and level")
    .addUserOption((o) => o.setName("user").setDescription("Whose rank").setRequired(false)),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const user = interaction.options.getUser("user") ?? interaction.user;
    const profile = await getProfile(ctx.client.db, interaction.guild.id, user.id);
    const next = xpForLevel(profile.level + 1);
    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle(`${user.username} rank`)
          .setDescription(
            `Level **${profile.level}** · **${profile.xp}** XP\nNext level at **${next}** XP`,
          ),
      ],
    });
  },
};

export const levelsCommand: KnoxCommand = {
  moduleId: "levels",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("levels")
    .setDescription("XP leaderboard"),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const rows = await topXp(ctx.client.db, interaction.guild.id, 10);
    const lines = rows.map((r, i) => `**${i + 1}.** <@${r.userId}> — lv ${r.level} · ${r.xp} XP`);
    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle("Levels")
          .setDescription(lines.join("\n") || "No XP yet. Chat to start."),
      ],
    });
  },
};

export const levelAdminCommand: KnoxCommand = {
  moduleId: "levels",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("level")
    .setDescription("Configure leveling")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("Set a member's XP")
        .addUserOption((o) => o.setName("user").setRequired(true).setDescription("Member"))
        .addIntegerOption((o) => o.setName("xp").setRequired(true).setDescription("XP amount").setMinValue(0)),
    )
    .addSubcommand((s) =>
      s
        .setName("reward")
        .setDescription("Give a role at a level")
        .addIntegerOption((o) => o.setName("level").setRequired(true).setDescription("Level").setMinValue(1))
        .addRoleOption((o) => o.setName("role").setRequired(true).setDescription("Reward role")),
    )
    .addSubcommand((s) =>
      s
        .setName("channel")
        .setDescription("Level-up announce channel")
        .addChannelOption((o) => o.setName("channel").setRequired(true).setDescription("Channel")),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild || !ctx.settings) return;
    const sub = interaction.options.getSubcommand();
    if (sub === "set") {
      const user = interaction.options.getUser("user", true);
      const xp = interaction.options.getInteger("xp", true);
      const level = levelFromXp(xp);
      await getProfile(ctx.client.db, interaction.guild.id, user.id);
      await ctx.client.db
        .update(memberProfiles)
        .set({ xp, level })
        .where(
          and(eq(memberProfiles.guildId, interaction.guild.id), eq(memberProfiles.userId, user.id)),
        );
      await interaction.reply({ content: `${user} is now **${xp}** XP (level ${level}).`, ephemeral: true });
      return;
    }
    if (sub === "reward") {
      const level = interaction.options.getInteger("level", true);
      const role = interaction.options.getRole("role", true);
      await ctx.client.db
        .insert(levelRewards)
        .values({ guildId: interaction.guild.id, level, roleId: role.id })
        .onConflictDoUpdate({
          target: [levelRewards.guildId, levelRewards.level],
          set: { roleId: role.id },
        });
      await interaction.reply({ content: `${role} will be given at level **${level}**.`, ephemeral: true });
      return;
    }
    const channel = interaction.options.getChannel("channel", true);
    await persistGuildSettings(ctx.client, interaction.guild.id, {
      ...ctx.settings,
      features: { ...ctx.settings.features, levelUpChannelId: channel.id },
    });
    await interaction.reply({ content: `Level-ups go to <#${channel.id}>.`, ephemeral: true });
  },
};
