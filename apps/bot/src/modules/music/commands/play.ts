import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildMember,
  type VoiceBasedChannel,
} from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { guildQueue, type MusicQueueMeta } from "../../../lib/player-queue.js";

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
        .setDescription("Song name, YouTube URL, or Spotify URL"),
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
    await interaction.deferReply();

    try {
      const searchResult = await player.search(query, { requestedBy: interaction.user.id });
      if (!searchResult.hasTracks()) {
        await interaction.editReply({ content: "No tracks found. Try a YouTube link or another name." });
        return;
      }
      const preview = searchResult.tracks[0];
      const extra = searchResult.playlist
        ? `\nPlaylist **${searchResult.playlist.title}** · ${searchResult.tracks.length} tracks`
        : "";
      await interaction.editReply({
        embeds: [
          knoxEmbed(ctx.settings?.embedColor)
            .setTitle("Queued")
            .setDescription(`**${preview.title}**\n${preview.author}${extra}`)
            .setThumbnail(preview.thumbnail)
            .setFooter({ text: preview.duration || "live" }),
        ],
      });
      await player.play(channel.id, searchResult, {
        requestedBy: interaction.user.id,
        nodeOptions: {
          metadata: {
            textChannelId: interaction.channelId,
            color: ctx.settings?.embedColor,
          } satisfies MusicQueueMeta,
          leaveOnEmpty: true,
          leaveOnEmptyCooldown: 60_000,
          leaveOnEnd: false,
          leaveOnStop: true,
          bufferingTimeout: 15_000,
          selfDeaf: true,
        },
      });
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
    await interaction.reply({ content: `Skipped **${skipped}**.` });
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
    await interaction.reply({ content: "Stopped. Queue cleared." });
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
      await interaction.reply({ content: "Resumed." });
      return;
    }
    queue.node.pause();
    await interaction.reply({ content: "Paused." });
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
    const bar = queue.node.createProgressBar() ?? track.duration;
    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle("Now playing")
          .setDescription(`**${track.title}**\n${track.author}\n${bar}`)
          .setThumbnail(track.thumbnail),
      ],
    });
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
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle("Queue")
          .setDescription(lines.join("\n").slice(0, 1900)),
      ],
    });
  },
};
