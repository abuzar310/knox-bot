import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { persistGuildSettings } from "../../../config/save-settings.js";

export const starboardCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("starboard")
    .setDescription("Highlight popular messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((o) =>
      o.setName("channel").setRequired(true).setDescription("Starboard channel").addChannelTypes(ChannelType.GuildText),
    )
    .addIntegerOption((o) =>
      o.setName("min").setDescription("Minimum stars").setMinValue(1).setMaxValue(20),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild || !ctx.settings) return;
    const channel = interaction.options.getChannel("channel", true);
    const min = interaction.options.getInteger("min") ?? 3;
    await persistGuildSettings(ctx.client, interaction.guild.id, {
      ...ctx.settings,
      features: {
        ...ctx.settings.features,
        starboardEnabled: true,
        starboardChannelId: channel.id,
        starboardMin: min,
      },
    });
    await interaction.reply({ content: `Starboard is <#${channel.id}> at **${min}** ⭐.`, ephemeral: true });
  },
};

export const loggingCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("logging")
    .setDescription("Event logs (edits, deletes, joins, voice, server changes)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption((o) => o.setName("messages").setDescription("Edits and deletes"))
    .addBooleanOption((o) => o.setName("members").setDescription("Joins and leaves"))
    .addBooleanOption((o) => o.setName("voice").setDescription("Voice joins"))
    .addBooleanOption((o) => o.setName("server").setDescription("Channel/role/webhook/ban/emoji changes, with who did them"))
    .addChannelOption((o) => o.setName("message_channel").setDescription("Edits and deletes").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addChannelOption((o) => o.setName("member_channel").setDescription("Nicknames and roles").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addChannelOption((o) => o.setName("join_channel").setDescription("Joins and leaves").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addChannelOption((o) => o.setName("server_channel").setDescription("Channel, role, and ban changes").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addChannelOption((o) => o.setName("voice_channel").setDescription("Voice joins and moves").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
  async execute(interaction, ctx) {
    if (!interaction.guild || !ctx.settings) return;
    const messages = interaction.options.getBoolean("messages");
    const members = interaction.options.getBoolean("members");
    const voice = interaction.options.getBoolean("voice");
    const server = interaction.options.getBoolean("server");
    const messageChannel = interaction.options.getChannel("message_channel");
    const memberChannel = interaction.options.getChannel("member_channel");
    const joinChannel = interaction.options.getChannel("join_channel");
    const serverChannel = interaction.options.getChannel("server_channel");
    const voiceChannel = interaction.options.getChannel("voice_channel");
    await persistGuildSettings(ctx.client, interaction.guild.id, {
      ...ctx.settings,
      features: {
        ...ctx.settings.features,
        logMessages: messages ?? ctx.settings.features.logMessages,
        logMembers: members ?? ctx.settings.features.logMembers,
        logVoice: voice ?? ctx.settings.features.logVoice,
        logServer: server ?? ctx.settings.features.logServer,
        logMessageChannelId: messageChannel?.id ?? ctx.settings.features.logMessageChannelId,
        logMemberChannelId: memberChannel?.id ?? ctx.settings.features.logMemberChannelId,
        logJoinChannelId: joinChannel?.id ?? ctx.settings.features.logJoinChannelId,
        logServerChannelId: serverChannel?.id ?? ctx.settings.features.logServerChannelId,
        logVoiceChannelId: voiceChannel?.id ?? ctx.settings.features.logVoiceChannelId,
      },
    });
    await interaction.reply({
      content: "Logging updated. Each kind uses its own channel when you set one, and the main log channel otherwise.",
      ephemeral: true,
    });
  },
};

export const voiceHubCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("voicehub")
    .setDescription("Join-to-create voice channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((o) =>
      o.setName("channel").setRequired(true).setDescription("Hub voice channel").addChannelTypes(ChannelType.GuildVoice),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild || !ctx.settings) return;
    const channel = interaction.options.getChannel("channel", true);
    await persistGuildSettings(ctx.client, interaction.guild.id, {
      ...ctx.settings,
      features: { ...ctx.settings.features, voiceHubChannelId: channel.id },
    });
    await interaction.reply({
      content: `Join <#${channel.id}> to get a private voice room.`,
      ephemeral: true,
    });
  },
};

export const countingCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("counting")
    .setDescription("Counting game channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((o) =>
      o.setName("channel").setRequired(true).setDescription("Channel").addChannelTypes(ChannelType.GuildText),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild || !ctx.settings) return;
    const channel = interaction.options.getChannel("channel", true);
    await persistGuildSettings(ctx.client, interaction.guild.id, {
      ...ctx.settings,
      features: {
        ...ctx.settings.features,
        countingChannelId: channel.id,
        countingCurrent: 0,
        countingLastUserId: null,
      },
    });
    await interaction.reply({ content: `Counting starts at 1 in <#${channel.id}>.` });
  },
};

export const serverStatsCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "admin",
  data: new SlashCommandBuilder()
    .setName("serverstats")
    .setDescription("Live member-count voice channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((o) =>
      o.setName("channel").setRequired(true).setDescription("Voice channel to rename").addChannelTypes(ChannelType.GuildVoice),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild || !ctx.settings) return;
    const channel = interaction.options.getChannel("channel", true);
    await persistGuildSettings(ctx.client, interaction.guild.id, {
      ...ctx.settings,
      features: { ...ctx.settings.features, statsChannelId: channel.id },
    });
    const ch = await interaction.guild.channels.fetch(channel.id);
    if (ch && "setName" in ch) {
      await ch.setName(`Members: ${interaction.guild.memberCount}`).catch(() => undefined);
    }
    await interaction.reply({ content: `Stats channel set to <#${channel.id}>.`, ephemeral: true });
  },
};

export const embedCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  requiredRank: "mod",
  data: new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Post a custom embed")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) => o.setName("title").setRequired(true).setDescription("Title"))
    .addStringOption((o) => o.setName("description").setRequired(true).setDescription("Body")),
  async execute(interaction, ctx) {
    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle(interaction.options.getString("title", true).slice(0, 256))
          .setDescription(interaction.options.getString("description", true).slice(0, 4000)),
      ],
    });
  },
};
