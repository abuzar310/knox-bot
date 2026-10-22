import { SlashCommandBuilder, ChannelType, PermissionFlagsBits, type GuildMember, type VoiceBasedChannel } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { controlRefusal } from "../../../lib/voice-gate.js";
import { knoxEmbed } from "../../../interactions/embed.js";
import { guildQueue } from "../../../lib/player-queue.js";
import { musicPanelPayload, upsertMusicPanel } from "../../../lib/music-panel.js";
import { fetchLyrics } from "../../../lib/lyrics.js";
import { playErrorMessage, type MusicLoop } from "../../../lib/music-session.js";
import { searchManyNames } from "../../../lib/youtube.js";
import { ensureGuildSettings, persistGuildSettings } from "../../../config/save-settings.js";

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
    {
      const refusal = await controlRefusal(interaction, ctx.client, { dj: true });
      if (refusal) {
        await interaction.reply({ content: refusal, ephemeral: true });
        return;
      }
    }
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
    {
      const refusal = await controlRefusal(interaction, ctx.client, { dj: true });
      if (refusal) {
        await interaction.reply({ content: refusal, ephemeral: true });
        return;
      }
    }
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
    {
      const refusal = await controlRefusal(interaction, ctx.client, { dj: true });
      if (refusal) {
        await interaction.reply({ content: refusal, ephemeral: true });
        return;
      }
    }
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
    {
      const refusal = await controlRefusal(interaction, ctx.client, { dj: true });
      if (refusal) {
        await interaction.reply({ content: refusal, ephemeral: true });
        return;
      }
    }
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
    {
      const refusal = await controlRefusal(interaction, ctx.client, { dj: true });
      if (refusal) {
        await interaction.reply({ content: refusal, ephemeral: true });
        return;
      }
    }
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
    {
      const refusal = await controlRefusal(interaction, ctx.client, { dj: true });
      if (refusal) {
        await interaction.reply({ content: refusal, ephemeral: true });
        return;
      }
    }
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
    {
      const refusal = await controlRefusal(interaction, ctx.client, { dj: true });
      if (refusal) {
        await interaction.reply({ content: refusal, ephemeral: true });
        return;
      }
    }
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
    {
      const refusal = await controlRefusal(interaction, ctx.client, { dj: true });
      if (refusal) {
        await interaction.reply({ content: refusal, ephemeral: true });
        return;
      }
    }
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

function voiceChannel(member: GuildMember | null): VoiceBasedChannel | null {
  const channel = member?.voice.channel;
  if (!channel) return null;
  if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) return null;
  return channel;
}

export const moveCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("move")
    .setDescription("Move a queued song to a new position")
    .addIntegerOption((o) => o.setName("from").setRequired(true).setMinValue(1).setDescription("Current queue number"))
    .addIntegerOption((o) => o.setName("to").setRequired(true).setMinValue(1).setDescription("New queue number")),
  async execute(interaction, ctx) {
    {
      const refusal = await controlRefusal(interaction, ctx.client, { dj: true });
      if (refusal) {
        await interaction.reply({ content: refusal, ephemeral: true });
        return;
      }
    }
    if (!interaction.guild) return;
    const session = guildQueue(ctx.client, interaction.guild.id);
    if (!session?.queue.length) {
      await interaction.reply({ content: "Queue is empty.", ephemeral: true });
      return;
    }
    const moved = session.move(interaction.options.getInteger("from", true), interaction.options.getInteger("to", true));
    if (!moved) {
      await interaction.reply({ content: "Those positions are out of range.", ephemeral: true });
      return;
    }
    await interaction.reply({ content: `Moved **${moved.title}**.`, ephemeral: true });
    await upsertMusicPanel(session).catch(() => undefined);
  },
};

export const removeDupesCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder().setName("removedupes").setDescription("Remove duplicate songs from the queue"),
  async execute(interaction, ctx) {
    {
      const refusal = await controlRefusal(interaction, ctx.client, { dj: true });
      if (refusal) {
        await interaction.reply({ content: refusal, ephemeral: true });
        return;
      }
    }
    if (!interaction.guild) return;
    const session = guildQueue(ctx.client, interaction.guild.id);
    if (!session) {
      await interaction.reply({ content: "Queue is empty.", ephemeral: true });
      return;
    }
    const removed = session.removeDupes();
    await interaction.reply({ content: removed ? `Removed ${removed} duplicate${removed === 1 ? "" : "s"}.` : "No duplicates.", ephemeral: true });
    await upsertMusicPanel(session).catch(() => undefined);
  },
};

export const autoplayCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("autoplay")
    .setDescription("Keep playing related songs when the queue runs out")
    .addBooleanOption((o) => o.setName("on").setDescription("On or off — skip to toggle")),
  async execute(interaction, ctx) {
    {
      const refusal = await controlRefusal(interaction, ctx.client, { dj: true });
      if (refusal) {
        await interaction.reply({ content: refusal, ephemeral: true });
        return;
      }
    }
    if (!interaction.guild) return;
    const session = guildQueue(ctx.client, interaction.guild.id);
    if (!session) {
      await interaction.reply({ content: "Nothing is playing.", ephemeral: true });
      return;
    }
    const next = interaction.options.getBoolean("on");
    session.autoplay = next == null ? !session.autoplay : next;
    await interaction.reply({ content: `Autoplay is **${session.autoplay ? "on" : "off"}**.`, ephemeral: true });
    await upsertMusicPanel(session).catch(() => undefined);
  },
};

export const joinCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder().setName("join").setDescription("Join your voice channel"),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
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
        await interaction.reply({ content: "I need Connect and Speak in that voice channel.", ephemeral: true });
        return;
      }
    }
    const manager = ctx.client.music;
    if (!manager) {
      await interaction.reply({ content: "Music is still starting.", ephemeral: true });
      return;
    }
    const existing = guildQueue(ctx.client, interaction.guild.id);
    const session = manager.getOrCreate(interaction.guild, channel, {
      textChannelId: existing?.meta.textChannelId ?? interaction.channelId,
      color: existing?.meta.color ?? ctx.settings?.embedColor,
      panelMessageId: existing?.meta.panelMessageId,
    });
    const ok = await session.join();
    await interaction.reply({
      content: ok ? `Joined **${channel.name}**.` : "Could not join voice. Try `/reconnect`.",
      ephemeral: true,
    });
  },
};

export const reconnectCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("reconnect")
    .setDescription("Drop and rejoin voice if you cannot hear the bot"),
  async execute(interaction, ctx) {
    {
      const refusal = await controlRefusal(interaction, ctx.client, { dj: true });
      if (refusal) {
        await interaction.reply({ content: refusal, ephemeral: true });
        return;
      }
    }
    if (!interaction.guild) return;
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const channel = voiceChannel(member);
    if (!channel) {
      await interaction.reply({ content: "Join a voice channel first.", ephemeral: true });
      return;
    }
    const session = guildQueue(ctx.client, interaction.guild.id);
    if (!session) {
      await interaction.reply({ content: "Nothing is playing. Use `/play` or `/join` first.", ephemeral: true });
      return;
    }
    session.voiceChannel = channel;
    const ok = await session.reconnectVoice(true);
    await interaction.reply({
      content: ok
        ? `Reconnected in **${channel.name}**. Song keeps going.`
        : "Reconnect failed. Try `/leave` then `/play` again.",
      ephemeral: true,
    });
  },
};

export const mixCommand: KnoxCommand = {
  moduleId: "music",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("mix")
    .setDescription("Save or play this server's mix")
    .addSubcommand((s) => s.setName("save").setDescription("Save the current queue as this server's mix"))
    .addSubcommand((s) => s.setName("play").setDescription("Play the saved mix"))
    .addSubcommand((s) => s.setName("show").setDescription("Show the saved mix")),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const sub = interaction.options.getSubcommand(false) || "show";
    if (sub === "show" || sub === "save") {
      const session = guildQueue(ctx.client, interaction.guild.id);
      if (sub === "save") {
        const names = [session?.current, ...(session?.queue ?? [])]
          .filter((track): track is NonNullable<typeof track> => Boolean(track))
          .map((track) => (track.query || track.title).trim())
          .filter(Boolean)
          .slice(0, 20);
        if (!names.length) {
          await interaction.reply({ content: "Play some songs first, then `/mix save`.", ephemeral: true });
          return;
        }
        const settings = await ensureGuildSettings(ctx.client, {
          id: interaction.guild.id,
          name: interaction.guild.name,
          icon: interaction.guild.icon,
          ownerId: interaction.guild.ownerId,
        });
        settings.features.musicMix = names;
        await persistGuildSettings(ctx.client, interaction.guild.id, settings);
        await interaction.reply({ content: `Saved **${names.length}** songs to this server's mix.`, ephemeral: true });
        return;
      }
      const mix = (await ctx.client.guildConfig.get(interaction.guild.id)).settings.features.musicMix ?? [];
      await interaction.reply({
        content: mix.length ? mix.map((name, i) => `**${i + 1}.** ${name}`).join("\n").slice(0, 1800) : "No mix saved. Play songs, then `/mix save`.",
        ephemeral: true,
      });
      return;
    }

    const mix = (await ctx.client.guildConfig.get(interaction.guild.id)).settings.features.musicMix ?? [];
    if (!mix.length) {
      await interaction.reply({ content: "No mix saved. Play songs, then `/mix save`.", ephemeral: true });
      return;
    }
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const channel = voiceChannel(member);
    if (!channel) {
      await interaction.reply({ content: "Join a voice channel first.", ephemeral: true });
      return;
    }
    const manager = ctx.client.music;
    if (!manager) {
      await interaction.reply({ content: "Music is still starting.", ephemeral: true });
      return;
    }
    await interaction.deferReply();
    try {
      const tracks = (await searchManyNames(mix)).map((track) => ({
        ...track,
        requestedBy: interaction.user.username,
      }));
      if (!tracks.length) {
        await interaction.editReply({ content: "Could not find those mix tracks." });
        return;
      }
      const existing = guildQueue(ctx.client, interaction.guild.id);
      const session = manager.getOrCreate(interaction.guild, channel, {
        textChannelId: existing?.meta.textChannelId ?? interaction.channelId,
        color: existing?.meta.color ?? ctx.settings?.embedColor,
        panelMessageId: existing?.meta.panelMessageId,
      });
      const played = await session.addAndPlay(tracks);
      if (played.alreadyPlaying) {
        await interaction.editReply({ content: `Added **${tracks.length}** mix tracks to the queue.` });
        await upsertMusicPanel(session);
        return;
      }
      await interaction.editReply(musicPanelPayload(session, ctx.settings?.embedColor));
      const reply = await interaction.fetchReply();
      session.meta.panelMessageId = reply.id;
      session.meta.textChannelId = interaction.channelId;
      session.meta.color = ctx.settings?.embedColor;
    } catch (error) {
      await interaction.editReply({ content: playErrorMessage(error) });
    }
  },
};
