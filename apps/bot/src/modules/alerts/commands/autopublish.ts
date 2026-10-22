// Announcement channels whose every post ZARU publishes, so followers in other servers see it without a click.
import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { persistGuildSettings } from "../../../config/save-settings.js";

const MAX_CHANNELS = 10;

export const autoPublishCommand: KnoxCommand = {
  moduleId: "alerts",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("autopublish")
    .setDescription("Publish every post in an announcement channel to the servers that follow it")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Auto-publish an announcement channel")
        .addChannelOption((o) =>
          o.setName("channel").setDescription("An announcement channel").addChannelTypes(ChannelType.GuildAnnouncement).setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Stop auto-publishing a channel")
        .addChannelOption((o) =>
          o.setName("channel").setDescription("The announcement channel").addChannelTypes(ChannelType.GuildAnnouncement).setRequired(true),
        ),
    )
    .addSubcommand((s) => s.setName("list").setDescription("Channels being auto-published")),
  async execute(interaction, ctx) {
    const guild = interaction.guild;
    if (!guild) return;
    const cached = await ctx.client.guildConfig.get(guild.id);
    const features = cached.settings.features;
    const current = features.autoPublishChannelIds;
    const sub = interaction.options.getSubcommand();

    if (sub === "list") {
      await interaction.reply({
        content: current.length
          ? `Auto-published: ${current.map((id) => `<#${id}>`).join(", ")}`
          : "No channel is auto-published yet. Try /autopublish add.",
        ephemeral: true,
      });
      return;
    }

    const channel = interaction.options.getChannel("channel", true);
    if (sub === "remove") {
      if (!current.includes(channel.id)) {
        await interaction.reply({ content: `<#${channel.id}> wasn't being auto-published.`, ephemeral: true });
        return;
      }
      await persistGuildSettings(ctx.client, guild.id, {
        ...cached.settings,
        features: { ...features, autoPublishChannelIds: current.filter((id) => id !== channel.id) },
      });
      await interaction.reply({ content: `Posts in <#${channel.id}> are no longer published automatically.`, ephemeral: true });
      return;
    }

    if (current.includes(channel.id)) {
      await interaction.reply({ content: `<#${channel.id}> is already auto-published.`, ephemeral: true });
      return;
    }
    if (current.length >= MAX_CHANNELS) {
      await interaction.reply({ content: `Up to ${MAX_CHANNELS} channels can be auto-published; remove one first.`, ephemeral: true });
      return;
    }
    const me = guild.members.me ?? (await guild.members.fetchMe());
    const real = guild.channels.cache.get(channel.id) ?? (await guild.channels.fetch(channel.id).catch(() => null));
    const perms = real?.permissionsFor(me);
    if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      await interaction.reply({ content: `I can't see or post in <#${channel.id}>, so I couldn't publish there.`, ephemeral: true });
      return;
    }
    await persistGuildSettings(ctx.client, guild.id, {
      ...cached.settings,
      features: { ...features, autoPublishChannelIds: [...current, channel.id] },
    });
    const note = perms.has(PermissionFlagsBits.ManageMessages)
      ? ""
      : `\nI only have Send Messages there, so I can publish my own posts but not other people's; give me Manage Messages in <#${channel.id}> to publish everything.`;
    await interaction.reply({
      content: `Every post in <#${channel.id}> will be published to the servers following it (Discord allows 10 an hour; ZARU stays under that).${note}`,
      ephemeral: true,
    });
  },
};
