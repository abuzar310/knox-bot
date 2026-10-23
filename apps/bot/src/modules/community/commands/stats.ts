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

export const digestCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("digest")
    .setDescription("A weekly activity summary, every Monday morning")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("Post the weekly digest in a channel (Mondays, 08:00 UTC)")
        .addChannelOption((o) => o.setName("channel").setDescription("The channel").addChannelTypes(...TEXT_LIKE).setRequired(true)),
    )
    .addSubcommand((s) => s.setName("off").setDescription("Stop the weekly digest")),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const cached = await ctx.client.guildConfig.get(guild.id);
    const channelId = interaction.options.getSubcommand() === "set" ? interaction.options.getChannel("channel", true).id : null;
    await persistGuildSettings(ctx.client, guild.id, { ...cached.settings, features: { ...cached.settings.features, digestChannelId: channelId } });
    await interaction.reply({
      content: channelId ? `Every Monday at 08:00 UTC the last week's activity is posted in <#${channelId}>. /stats shows it any time.` : "The weekly digest is off.",
      ephemeral: true,
    });
  },
};

export const eventRemindersCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("eventreminders")
    .setDescription("Announce new Discord events and remind everyone 30 minutes before they start")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("Where event posts go")
        .addChannelOption((o) => o.setName("channel").setDescription("The channel").addChannelTypes(...TEXT_LIKE).setRequired(true))
        .addRoleOption((o) => o.setName("ping").setDescription("Role to ping with the 30-minute reminder")),
    )
    .addSubcommand((s) => s.setName("off").setDescription("Stop event posts")),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const cached = await ctx.client.guildConfig.get(guild.id);
    const on = interaction.options.getSubcommand() === "set";
    const channelId = on ? interaction.options.getChannel("channel", true).id : null;
    const roleId = on ? (interaction.options.getRole("ping")?.id ?? null) : null;
    await persistGuildSettings(ctx.client, guild.id, {
      ...cached.settings,
      features: { ...cached.settings.features, eventReminderChannelId: channelId, eventReminderRoleId: roleId },
    });
    await interaction.reply({
      content: on
        ? `New events are announced in <#${channelId}> and everyone${roleId ? ` (<@&${roleId}>)` : ""} is reminded 30 minutes before each one starts.`
        : "Event posts are off.",
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
  },
};
