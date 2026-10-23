import { AttachmentBuilder, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { and, count, eq, gt } from "drizzle-orm";
import { levelRewards, memberProfiles } from "@knox/db";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { getProfile, levelFromXp, xpForLevel } from "../../../lib/profiles.js";
import { roleIdGrantProblem } from "../../../lib/roles.js";
import { topVoice, topXp } from "../../../lib/xp.js";
import { formatVoiceTime } from "../../../lib/voice-xp.js";
import { renderRankCard } from "../../../lib/cards.js";

export const rankCommand: KnoxCommand = {
  moduleId: "levels",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show your XP, level, and progress")
    .addUserOption((o) => o.setName("user").setDescription("Whose rank").setRequired(false)),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const user = interaction.options.getUser("user") ?? interaction.user;
    await interaction.deferReply();
    const profile = await getProfile(ctx.client.db, interaction.guild.id, user.id);
    const next = xpForLevel(profile.level + 1);
    const [ahead] = await ctx.client.db
      .select({ n: count() })
      .from(memberProfiles)
      .where(and(eq(memberProfiles.guildId, interaction.guild.id), gt(memberProfiles.xp, profile.xp)));
    const position = (ahead?.n ?? 0) + 1;
    const member = interaction.guild.members.cache.get(user.id);
    const card = await renderRankCard({
      user,
      displayName: member?.displayName ?? user.displayName,
      level: profile.level,
      xp: profile.xp,
      levelStartXp: xpForLevel(profile.level),
      nextLevelXp: next,
      position,
      voiceTime: formatVoiceTime(profile.voiceSeconds),
      accent: ctx.settings?.embedColor ?? "#E8FF47",
    });
    if (card) {
      await interaction.editReply({ files: [new AttachmentBuilder(card, { name: "rank.png" })] });
      return;
    }
    await interaction.editReply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle(`${user.username} rank`)
          .setDescription(
            `Level **${profile.level}** · **${profile.xp}** XP · #${position}\nNext level at **${next}** XP\nVoice time: **${formatVoiceTime(profile.voiceSeconds)}**`,
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
    .setDescription("XP leaderboard")
    .addStringOption((o) =>
      o.setName("board").setDescription("What to rank by").addChoices({ name: "XP", value: "xp" }, { name: "Voice time", value: "voice" }),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const byVoice = interaction.options.getString("board") === "voice";
    const rows = byVoice ? await topVoice(ctx.client.db, interaction.guild.id, 10) : await topXp(ctx.client.db, interaction.guild.id, 10);
    const lines = rows
      .filter((r) => !byVoice || r.voiceSeconds > 0)
      .map((r, i) => (byVoice ? `**${i + 1}.** <@${r.userId}> — ${formatVoiceTime(r.voiceSeconds)}` : `**${i + 1}.** <@${r.userId}> — lv ${r.level} · ${r.xp} XP`));
    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle(byVoice ? "Voice time" : "Levels")
          .setDescription(lines.join("\n") || (byVoice ? "No voice time yet. Hang out in voice with others." : "No XP yet. Chat to start.")),
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
    )
    .addSubcommand((s) =>
      s
        .setName("voicexp")
        .setDescription("XP for time spent in voice with others")
        .addBooleanOption((o) => o.setName("enabled").setRequired(true).setDescription("On or off"))
        .addIntegerOption((o) => o.setName("per_minute").setDescription("XP per minute (default 5)").setMinValue(0).setMaxValue(50)),
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
      const problem = await roleIdGrantProblem(interaction.guild, role.id);
      if (problem) {
        await interaction.reply({ content: `Can't use that as a level reward: ${problem}.`, ephemeral: true });
        return;
      }
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
    if (sub === "voicexp") {
      const enabled = interaction.options.getBoolean("enabled", true);
      const perMinute = interaction.options.getInteger("per_minute") ?? ctx.settings.features.voiceXpPerMinute;
      await persistGuildSettings(ctx.client, interaction.guild.id, {
        ...ctx.settings,
        features: { ...ctx.settings.features, voiceXpEnabled: enabled, voiceXpPerMinute: perMinute },
      });
      await interaction.reply({
        content: enabled
          ? `Voice XP is on: **${perMinute}** XP per minute in voice with at least one other person (deafened members and the AFK channel don't count).`
          : "Voice XP is off.",
        ephemeral: true,
      });
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
