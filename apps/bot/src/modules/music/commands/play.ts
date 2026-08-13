import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildMember,
  type VoiceBasedChannel,
} from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { guildQueue } from "../../../lib/player-queue.js";
import { musicPanelPayload, upsertMusicPanel } from "../../../lib/music-panel.js";
import { resolvePlayQuery } from "../../../lib/youtube.js";

function voiceChannel(member: GuildMember | null): VoiceBasedChannel | null {
  const channel = member?.voice.channel;
  if (!channel) return null;
  if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) {
    return null;
  }
  return channel;
}

export const playCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play YouTube, Spotify, or a search in your voice channel")
    .addStringOption((o) =>
      o
        .setName("query")
        .setRequired(true)
        .setDescription("Song name, YouTube URL, SoundCloud URL, or Spotify URL"),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild) {
      await interaction.reply({ content: "Run this in a server.", ephemeral: true });
      return;
    }
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const channel = voiceChannel(member);
    if (!channel) {
      await interaction.reply({ content: "Join a voice channel first.", ephemeral: true });
      return;
    }
    const me = interaction.guild.members.me;
    if (me) {
      const perms = channel.permissionsFor(me);
      if (!perms?.has(PermissionFlagsBits.Connect) || !perms.has(PermissionFlagsBits.Speak)) {
        await interaction.reply({
          content: "I need Connect and Speak in that voice channel.",
          ephemeral: true,
        });
        return;
      }
    }

    const query = interaction.options.getString("query", true);
    const manager = ctx.client.music;
    if (!manager) {
      await interaction.reply({
        content: "Music is still starting. Try `/play` again in a few seconds.",
        ephemeral: true,
      });
      return;
    }
    const existing = guildQueue(ctx.client, interaction.guild.id);
    const alreadyPlaying = Boolean(existing?.current);
    await interaction.deferReply({ ephemeral: alreadyPlaying });

    try {
      const result = await resolvePlayQuery(query, interaction.user.username);
      if (!result.tracks.length) {
        await interaction.editReply({ content: "No tracks found. Try a YouTube link or another name." });
        return;
      }
      const session = manager.getOrCreate(interaction.guild, channel, {
        textChannelId: existing?.meta.textChannelId ?? interaction.channelId,
        color: existing?.meta.color ?? ctx.settings?.embedColor,
        panelMessageId: existing?.meta.panelMessageId,
      });
      const extra = result.playlistTitle
        ? ` · playlist **${result.playlistTitle}** (${result.tracks.length})`
        : "";
      const played = await session.addAndPlay(result.tracks);
      if (played.alreadyPlaying) {
        await interaction.editReply({ content: `Added **${played.preview.title}**${extra}` });
        await upsertMusicPanel(session);
        return;
      }
      await interaction.editReply(musicPanelPayload(session, ctx.settings?.embedColor));
      const reply = await interaction.fetchReply();
      session.meta.panelMessageId = reply.id;
      session.meta.textChannelId = interaction.channelId;
      session.meta.color = ctx.settings?.embedColor;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not play that.";
      await interaction.editReply({
        content: `Could not play that. Try a YouTube link or a song name.\n\`${message.slice(0, 300)}\``,
      });
    }
  },
};

export const skipCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder().setName("skip").setDescription("Skip the current track"),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const session = guildQueue(ctx.client, interaction.guild.id);
    if (!session?.current) {
      await interaction.reply({ content: "Nothing is playing.", ephemeral: true });
      return;
    }
    const skipped = session.current.title;
    await session.skip();
    await interaction.reply({ content: `Skipped **${skipped}**.`, ephemeral: true });
    await upsertMusicPanel(session).catch(() => undefined);
  },
};

export const stopCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder().setName("stop").setDescription("Stop playback and clear the queue"),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const session = guildQueue(ctx.client, interaction.guild.id);
    if (!session) {
      await interaction.reply({ content: "Nothing is playing.", ephemeral: true });
      return;
    }
    await session.stop();
    await interaction.reply({ content: "Stopped. Queue cleared.", ephemeral: true });
  },
};

export const pauseCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder().setName("pause").setDescription("Pause or resume playback"),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const session = guildQueue(ctx.client, interaction.guild.id);
    if (!session?.current) {
      await interaction.reply({ content: "Nothing is playing.", ephemeral: true });
      return;
    }
    const state = session.pauseToggle();
    await interaction.reply({ content: state === "resumed" ? "Resumed." : "Paused.", ephemeral: true });
    await upsertMusicPanel(session).catch(() => undefined);
  },
};

export const nowPlayingCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder().setName("nowplaying").setDescription("Show the current track"),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const session = guildQueue(ctx.client, interaction.guild.id);
    if (!session?.current) {
      await interaction.reply({ content: "Nothing is playing.", ephemeral: true });
      return;
    }
    const payload = musicPanelPayload(session, ctx.settings?.embedColor);
    await interaction.reply(payload);
    const reply = await interaction.fetchReply();
    session.meta.panelMessageId = reply.id;
    session.meta.textChannelId = interaction.channelId;
  },
};

export const queueCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder().setName("queue").setDescription("Show the music queue"),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const session = guildQueue(ctx.client, interaction.guild.id);
    if (!session?.current) {
      await interaction.reply({ content: "Queue is empty." });
      return;
    }
    const upcoming = session.queue.slice(0, 10);
    const lines = [
      `**Now:** ${session.current.title}`,
      ...upcoming.map((t, i) => `**${i + 1}.** ${t.title}`),
    ];
    await interaction.reply({
      ephemeral: true,
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle("Queue")
          .setDescription(lines.join("\n").slice(0, 1900)),
      ],
    });
  },
};
