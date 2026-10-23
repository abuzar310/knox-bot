// /stats shows activity; /digest and /eventreminders choose where the weekly summary and event reminders go.
import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { statsSummary } from "../../../lib/stats.js";
import { statsEmbed } from "../lib/digest.js";

const TEXT_LIKE = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const;

export const statsCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Server activity: messages, joins, voice time, most active members and channels")
    .addIntegerOption((o) => o.setName("days").setDescription("How many days back (default 7, up to 90)").setMinValue(1).setMaxValue(90)),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    await interaction.deferReply();
    const days = interaction.options.getInteger("days") ?? 7;
    const summary = await statsSummary(ctx.client, guild.id, days);
    await interaction.editReply({ embeds: [statsEmbed(guild, summary, (await ctx.client.guildConfig.get(guild.id)).settings.embedColor, "📊 Server activity")] });
  },
};

