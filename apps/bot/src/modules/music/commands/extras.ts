import { SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { guildQueue } from "../../../lib/player-queue.js";
import { upsertMusicPanel } from "../../../lib/music-panel.js";
import { fetchLyrics } from "../../../lib/lyrics.js";
import type { MusicLoop } from "../../../lib/music-session.js";

function parseSeek(raw: string) {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const parts = trimmed.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export const removeCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove a song from the queue")
    .addIntegerOption((o) => o.setName("position").setRequired(true).setMinValue(1).setDescription("Queue number from /queue")),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const session = guildQueue(ctx.client, interaction.guild.id);
    if (!session) {
      await interaction.reply({ content: "Queue is empty.", ephemeral: true });
      return;
    }
    const position = interaction.options.getInteger("position", true);
    const removed = session.removeAt(position);
    if (!removed) {
      await interaction.reply({ content: "No song at that position.", ephemeral: true });
      return;
    }
    await interaction.reply({ content: `Removed **${removed.title}**.`, ephemeral: true });
    await upsertMusicPanel(session).catch(() => undefined);
  },
};

export const skipToCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("skipto")
    .setDescription("Jump to a song in the queue")
    .addIntegerOption((o) => o.setName("position").setRequired(true).setMinValue(1).setDescription("Queue number to play now")),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const session = guildQueue(ctx.client, interaction.guild.id);
    if (!session?.current) {
      await interaction.reply({ content: "Nothing is playing.", ephemeral: true });
      return;
    }
    const ok = await session.skipTo(interaction.options.getInteger("position", true));
    if (!ok) {
      await interaction.reply({ content: "No song at that position.", ephemeral: true });
      return;
    }
    await interaction.reply({ content: "Skipping to that track.", ephemeral: true });
  },
};

export const clearCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder().setName("clear").setDescription("Clear the upcoming queue"),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const session = guildQueue(ctx.client, interaction.guild.id);
    if (!session) {
      await interaction.reply({ content: "Queue is empty.", ephemeral: true });
      return;
    }
    session.clearQueue();
    await interaction.reply({ content: "Queue cleared. Current song keeps playing.", ephemeral: true });
    await upsertMusicPanel(session).catch(() => undefined);
  },
};

export const volumeCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Set playback volume")
    .addIntegerOption((o) => o.setName("percent").setRequired(true).setMinValue(0).setMaxValue(100).setDescription("0 to 100")),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const session = guildQueue(ctx.client, interaction.guild.id);
    if (!session?.current) {
      await interaction.reply({ content: "Nothing is playing.", ephemeral: true });
      return;
    }
    session.setVolume(interaction.options.getInteger("percent", true));
    await interaction.reply({ content: `Volume set to **${session.volume}%**.`, ephemeral: true });
    await upsertMusicPanel(session).catch(() => undefined);
  },
};

export const loopCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("loop")
    .setDescription("Set loop mode")
    .addStringOption((o) =>
      o
        .setName("mode")
        .setRequired(true)
        .setDescription("off, track, or queue")
        .addChoices(
          { name: "Off", value: "off" },
          { name: "Track", value: "track" },
          { name: "Queue", value: "queue" },
        ),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const session = guildQueue(ctx.client, interaction.guild.id);
    if (!session?.current) {
      await interaction.reply({ content: "Nothing is playing.", ephemeral: true });
      return;
    }
    const mode = interaction.options.getString("mode", true) as MusicLoop;
    session.setLoop(mode);
    await interaction.reply({ content: `Loop set to **${mode}**.`, ephemeral: true });
    await upsertMusicPanel(session).catch(() => undefined);
  },
};

export const shuffleCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder().setName("shuffle").setDescription("Shuffle the upcoming queue"),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const session = guildQueue(ctx.client, interaction.guild.id);
    if (!session || session.queue.length < 2) {
      await interaction.reply({ content: "Need at least 2 queued tracks to shuffle.", ephemeral: true });
      return;
    }
    session.shuffle();
    await interaction.reply({ content: "Queue shuffled.", ephemeral: true });
    await upsertMusicPanel(session).catch(() => undefined);
  },
};

export const seekCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("seek")
    .setDescription("Jump to a time in the current song")
    .addStringOption((o) => o.setName("time").setRequired(true).setDescription("Seconds or mm:ss")),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const session = guildQueue(ctx.client, interaction.guild.id);
    if (!session?.current) {
      await interaction.reply({ content: "Nothing is playing.", ephemeral: true });
      return;
    }
    const seconds = parseSeek(interaction.options.getString("time", true));
    if (seconds === null) {
      await interaction.reply({ content: "Use seconds or `mm:ss`.", ephemeral: true });
      return;
    }
    const ok = await session.seekTo(seconds);
    if (!ok) {
      await interaction.reply({ content: "Could not seek that track yet.", ephemeral: true });
      return;
    }
    await interaction.reply({ content: `Jumped to **${interaction.options.getString("time", true)}**.`, ephemeral: true });
  },
};

export const lyricsCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("lyrics")
    .setDescription("Show lyrics for the current song")
    .addStringOption((o) => o.setName("query").setDescription("Optional song name if nothing is playing")),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const session = guildQueue(ctx.client, interaction.guild.id);
    const query = interaction.options.getString("query");
    const title = query || session?.current?.title;
    const artist = query ? "" : session?.current?.artist || "";
    if (!title) {
      await interaction.reply({ content: "Nothing is playing. Pass a song name.", ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const lyrics = await fetchLyrics(title, artist);
    if (!lyrics) {
      await interaction.editReply({ content: `No lyrics found for **${title}**.` });
      return;
    }
    await interaction.editReply({
      embeds: [knoxEmbed(ctx.settings?.embedColor).setTitle(title.slice(0, 80)).setDescription(lyrics)],
    });
  },
};

export const leaveCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder().setName("leave").setDescription("Stop and leave the voice channel"),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const session = guildQueue(ctx.client, interaction.guild.id);
    if (!session) {
      await interaction.reply({ content: "I am not in a voice channel.", ephemeral: true });
      return;
    }
    await session.stop();
    await interaction.reply({ content: "Left the voice channel.", ephemeral: true });
  },
};
