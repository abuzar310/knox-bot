// Delayed join roles, a channel that clears itself, and a channel for free games.
import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { persistGuildSettings } from "../../../config/save-settings.js";
import { roleIdGrantProblem } from "../../../lib/roles.js";

const TEXT = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const;

export const delayRoleCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("delayrole")
    .setDescription("Give a role some time after a member joins")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Add a delayed role")
        .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true))
        .addIntegerOption((o) => o.setName("minutes").setDescription("Minutes after they join").setRequired(true).setMinValue(1).setMaxValue(43200)),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Stop giving a delayed role")
        .addRoleOption((o) => o.setName("role").setDescription("Role").setRequired(true)),
    )
    .addSubcommand((s) => s.setName("list").setDescription("Delayed roles")),
  async execute(interaction, ctx) {
    if (!interaction.guild || !ctx.settings) return;
    const features = ctx.settings.features;
    const sub = interaction.options.getSubcommand();
    if (sub === "list") {
      const lines = features.delayedRoles.map((row) => `<@&${row.roleId}> after ${row.delayMinutes} min`);
      await interaction.reply({ content: lines.length ? lines.join("\n") : "No delayed roles.", ephemeral: true });
      return;
    }
    const role = interaction.options.getRole("role", true);
    if (sub === "remove") {
      await persistGuildSettings(ctx.client, interaction.guild.id, {
        ...ctx.settings,
        features: { ...features, delayedRoles: features.delayedRoles.filter((row) => row.roleId !== role.id) },
      });
      await interaction.reply({ content: `${role} will no longer be given on a delay.`, ephemeral: true });
      return;
    }
    const problem = await roleIdGrantProblem(interaction.guild, role.id);
    if (problem) {
      await interaction.reply({ content: `Can't use that role: ${problem}.`, ephemeral: true });
      return;
    }
    const minutes = interaction.options.getInteger("minutes", true);
    const delayedRoles = [...features.delayedRoles.filter((row) => row.roleId !== role.id), { roleId: role.id, delayMinutes: minutes }].slice(0, 8);
    await persistGuildSettings(ctx.client, interaction.guild.id, { ...ctx.settings, features: { ...features, delayedRoles } });
    await interaction.reply({ content: `${role} is given ${minutes} minutes after someone joins.`, ephemeral: true });
  },
};

export const autoPurgeCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("autopurge")
    .setDescription("Clear a channel on a timer (messages younger than 14 days)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption((o) => o.setName("channel").setDescription("Channel").setRequired(true).addChannelTypes(...TEXT))
    .addIntegerOption((o) => o.setName("hours").setDescription("How often (0 turns it off)").setRequired(true).setMinValue(0).setMaxValue(168)),
  async execute(interaction, ctx) {
    if (!interaction.guild || !ctx.settings) return;
    const channel = interaction.options.getChannel("channel", true);
    const hours = interaction.options.getInteger("hours", true);
    const rest = ctx.settings.features.scheduledPurges.filter((row) => row.channelId !== channel.id);
    const scheduledPurges = hours === 0
      ? rest
      : [...rest, { channelId: channel.id, everyHours: hours, lastRunAt: new Date().toISOString() }].slice(0, 8);
    await persistGuildSettings(ctx.client, interaction.guild.id, {
      ...ctx.settings,
      features: { ...ctx.settings.features, scheduledPurges },
    });
    await interaction.reply({
      content: hours === 0 ? `<#${channel.id}> will no longer clear itself.` : `<#${channel.id}> clears every **${hours}** hours. Pinned messages stay.`,
      ephemeral: true,
    });
  },
};

export const freeGamesCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("freegames")
    .setDescription("Post when a store lists a game for free")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((o) => o.setName("channel").setDescription("Where to post (leave empty to turn off)").addChannelTypes(...TEXT)),
  async execute(interaction, ctx) {
    if (!interaction.guild || !ctx.settings) return;
    const channel = interaction.options.getChannel("channel");
    await persistGuildSettings(ctx.client, interaction.guild.id, {
      ...ctx.settings,
      features: { ...ctx.settings.features, freeGamesChannelId: channel?.id ?? null },
    });
    await interaction.reply({
      content: channel ? `Free games go to <#${channel.id}>.` : "Free-game posts are off.",
      ephemeral: true,
    });
  },
};
