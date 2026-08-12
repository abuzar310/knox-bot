import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { and, eq } from "drizzle-orm";
import { memberProfiles } from "@knox/db";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { getProfile } from "../../../lib/profiles.js";

export const repCommand: KnoxCommand = {
  moduleId: "levels",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("rep")
    .setDescription("Give reputation")
    .addUserOption((o) => o.setName("user").setDescription("Member").setRequired(true)),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const user = interaction.options.getUser("user", true);
    if (user.id === interaction.user.id || user.bot) {
      await interaction.reply({ content: "Pick someone else.", ephemeral: true });
      return;
    }
    await getProfile(ctx.client.db, interaction.guild.id, user.id);
    const [row] = await ctx.client.db
      .select()
      .from(memberProfiles)
      .where(and(eq(memberProfiles.guildId, interaction.guild.id), eq(memberProfiles.userId, user.id)));
    const next = (row?.rep ?? 0) + 1;
    await ctx.client.db
      .update(memberProfiles)
      .set({ rep: next })
      .where(and(eq(memberProfiles.guildId, interaction.guild.id), eq(memberProfiles.userId, user.id)));
    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle("Rep")
          .setDescription(`${user} now has **${next}** rep.`),
      ],
    });
  },
};

export const birthdayCommand: KnoxCommand = {
  moduleId: "levels",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("birthday")
    .setDescription("Set or announce birthdays")
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("Save your birthday")
        .addIntegerOption((o) => o.setName("month").setRequired(true).setMinValue(1).setMaxValue(12).setDescription("Month"))
        .addIntegerOption((o) => o.setName("day").setRequired(true).setMinValue(1).setMaxValue(31).setDescription("Day")),
    )
    .addSubcommand((s) =>
      s
        .setName("channel")
        .setDescription("Birthday announce channel")
        .addChannelOption((o) => o.setName("channel").setRequired(true).setDescription("Channel")),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild || !ctx.settings) return;
    const sub = interaction.options.getSubcommand();
    if (sub === "set") {
      const month = interaction.options.getInteger("month", true);
      const day = interaction.options.getInteger("day", true);
      await getProfile(ctx.client.db, interaction.guild.id, interaction.user.id);
      await ctx.client.db
        .update(memberProfiles)
        .set({ birthdayMonth: month, birthdayDay: day })
        .where(
          and(
            eq(memberProfiles.guildId, interaction.guild.id),
            eq(memberProfiles.userId, interaction.user.id),
          ),
        );
      await interaction.reply({ content: `Birthday saved: **${month}/${day}**.`, ephemeral: true });
      return;
    }
    const { persistGuildSettings } = await import("../../../config/save-settings.js");
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "Admins set the birthday channel.", ephemeral: true });
      return;
    }
    const channel = interaction.options.getChannel("channel", true);
    await persistGuildSettings(ctx.client, interaction.guild.id, {
      ...ctx.settings,
      features: { ...ctx.settings.features, birthdayChannelId: channel.id },
    });
    await interaction.reply({ content: `Birthdays go to <#${channel.id}>.`, ephemeral: true });
  },
};
