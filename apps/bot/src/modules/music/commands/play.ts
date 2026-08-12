import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildMember,
  type VoiceBasedChannel,
} from "discord.js";
import { QueryType } from "discord-player";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { guildQueue, type MusicQueueMeta } from "../../../lib/player-queue.js";
import { logger } from "../../../logger.js";
import { resolveYoutubeSearchUrl } from "../../../lib/yt-stream.js";
import { musicPanelPayload, upsertMusicPanel } from "../../../lib/music-panel.js";

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
    const player = ctx.client.player;
    if (!player) {
      await interaction.reply({
        content: "Music is still starting. Try `/play` again in a few seconds.",
        ephemeral: true,
      });
      return;
    }
    const existingQueue = guildQueue(ctx.client, interaction.guild.id);
    const alreadyPlaying = Boolean(existingQueue?.currentTrack);
    await interaction.deferReply({ ephemeral: alreadyPlaying });

    try {
      let searchResult = await player.search(query, { requestedBy: interaction.user.id });
      if (!searchResult.hasTracks()) {
        logger.warn({ query }, "youtube search empty, trying soundcloud");
        searchResult = await player.search(query, {
          requestedBy: interaction.user.id,
          searchEngine: QueryType.SOUNDCLOUD_SEARCH,
        });
      }
      if (!searchResult.hasTracks()) {
        logger.warn({ query }, "soundcloud search empty, trying yt-dlp");
        try {
          const url = await resolveYoutubeSearchUrl(query);
          searchResult = await player.search(url, { requestedBy: interaction.user.id });
        } catch (error) {
          logger.warn({ err: error, query }, "yt-dlp search failed");
        }
      }
      if (!searchResult.hasTracks()) {
        await interaction.editReply({ content: "No tracks found. Try a YouTube link or another name." });
        return;
      }
      const preview = searchResult.tracks[0];
      const extra = searchResult.playlist
        ? ` · playlist **${searchResult.playlist.title}** (${searchResult.tracks.length})`
        : "";
      await player.play(channel.id, searchResult, {
        requestedBy: interaction.user.id,
        nodeOptions: {
          metadata: {
            textChannelId: existingQueue?.metadata?.textChannelId ?? interaction.channelId,
            color: existingQueue?.metadata?.color ?? ctx.settings?.embedColor,
            panelMessageId: existingQueue?.metadata?.panelMessageId,
          } satisfies MusicQueueMeta,
          leaveOnEmpty: true,
          leaveOnEmptyCooldown: 60_000,
          leaveOnEnd: false,
          leaveOnStop: true,
          bufferingTimeout: 15_000,
          selfDeaf: true,
        },
      });
      const queue = guildQueue(ctx.client, interaction.guild.id);
      if (alreadyPlaying) {
        await interaction.editReply({ content: `Added **${preview.title}**${extra}` });
        if (queue) await upsertMusicPanel(queue);
        return;
      }
      if (!queue?.currentTrack) {
        await interaction.editReply({ content: `Added **${preview.title}**${extra}` });
        return;
      }
      await interaction.editReply(musicPanelPayload(queue, ctx.settings?.embedColor));
      const reply = await interaction.fetchReply();
      queue.metadata.panelMessageId = reply.id;
      queue.metadata.textChannelId = interaction.channelId;
      queue.metadata.color = ctx.settings?.embedColor;
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
    const queue = guildQueue(ctx.client, interaction.guild.id);
    if (!queue?.currentTrack) {
      await interaction.reply({ content: "Nothing is playing.", ephemeral: true });
      return;
    }
    const skipped = queue.currentTrack.title;
    queue.node.skip();
    await interaction.reply({ content: `Skipped **${skipped}**.`, ephemeral: true });
    await upsertMusicPanel(queue).catch(() => undefined);
  },
};

export const stopCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder().setName("stop").setDescription("Stop playback and clear the queue"),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const queue = guildQueue(ctx.client, interaction.guild.id);
    if (!queue) {
      await interaction.reply({ content: "Nothing is playing.", ephemeral: true });
      return;
    }
    queue.delete();
    await interaction.reply({ content: "Stopped. Queue cleared.", ephemeral: true });
  },
};

export const pauseCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder().setName("pause").setDescription("Pause or resume playback"),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const queue = guildQueue(ctx.client, interaction.guild.id);
    if (!queue?.currentTrack) {
      await interaction.reply({ content: "Nothing is playing.", ephemeral: true });
      return;
    }
    if (queue.node.isPaused()) {
      queue.node.resume();
      await interaction.reply({ content: "Resumed.", ephemeral: true });
    } else {
      queue.node.pause();
      await interaction.reply({ content: "Paused.", ephemeral: true });
    }
    await upsertMusicPanel(queue).catch(() => undefined);
  },
};

export const nowPlayingCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder().setName("nowplaying").setDescription("Show the current track"),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const queue = guildQueue(ctx.client, interaction.guild.id);
    const track = queue?.currentTrack;
    if (!track) {
      await interaction.reply({ content: "Nothing is playing.", ephemeral: true });
      return;
    }
    const payload = musicPanelPayload(queue, ctx.settings?.embedColor);
    await interaction.reply(payload);
    const reply = await interaction.fetchReply();
    if (queue.metadata) {
      queue.metadata.panelMessageId = reply.id;
      queue.metadata.textChannelId = interaction.channelId;
    }
  },
};

export const queueCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder().setName("queue").setDescription("Show the music queue"),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const queue = guildQueue(ctx.client, interaction.guild.id);
    if (!queue?.currentTrack) {
      await interaction.reply({ content: "Queue is empty." });
      return;
    }
    const upcoming = queue.tracks.toArray().slice(0, 10);
    const lines = [
      `**Now:** ${queue.currentTrack.title}`,
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
