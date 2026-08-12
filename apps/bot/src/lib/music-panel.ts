import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type GuildMember,
} from "discord.js";
import { QueueRepeatMode, type GuildQueue, type Track } from "discord-player";
import type { KnoxClient } from "../client.js";
import { knoxEmbed } from "../interactions/embed.js";
import { guildQueue, type MusicQueueMeta } from "./player-queue.js";

export const MUSIC_PREFIX = "knox:music:";

export const MusicBtn = {
  prev: "knox:music:prev",
  pause: "knox:music:pause",
  skip: "knox:music:skip",
  stop: "knox:music:stop",
  shuffle: "knox:music:shuffle",
  voldown: "knox:music:voldown",
  volup: "knox:music:volup",
  loop: "knox:music:loop",
  queue: "knox:music:queue",
} as const;

function loopLabel(mode: QueueRepeatMode) {
  if (mode === QueueRepeatMode.TRACK) return "Track";
  if (mode === QueueRepeatMode.QUEUE) return "Queue";
  return "Off";
}

function volumeOf(queue: GuildQueue<MusicQueueMeta>) {
  const value = queue.node.volume;
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 100;
}

function controlRows(queue: GuildQueue<MusicQueueMeta> | null, disabled = false) {
  const paused = queue?.node.isPaused() ?? false;
  const looping = queue ? queue.repeatMode !== QueueRepeatMode.OFF : false;
  const dead = disabled || !queue?.currentTrack;

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(MusicBtn.prev).setEmoji("⏮️").setStyle(ButtonStyle.Secondary).setDisabled(dead),
    new ButtonBuilder()
      .setCustomId(MusicBtn.pause)
      .setEmoji(paused ? "▶️" : "⏸️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(dead),
    new ButtonBuilder().setCustomId(MusicBtn.skip).setEmoji("⏭️").setStyle(ButtonStyle.Secondary).setDisabled(dead),
    new ButtonBuilder().setCustomId(MusicBtn.stop).setEmoji("⏹️").setStyle(ButtonStyle.Danger).setDisabled(dead),
    new ButtonBuilder().setCustomId(MusicBtn.shuffle).setEmoji("🔀").setStyle(ButtonStyle.Secondary).setDisabled(dead),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(MusicBtn.voldown).setEmoji("🔉").setStyle(ButtonStyle.Secondary).setDisabled(dead),
    new ButtonBuilder().setCustomId(MusicBtn.volup).setEmoji("🔊").setStyle(ButtonStyle.Secondary).setDisabled(dead),
    new ButtonBuilder()
      .setCustomId(MusicBtn.loop)
      .setEmoji("🔁")
      .setStyle(looping ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(dead),
    new ButtonBuilder().setCustomId(MusicBtn.queue).setEmoji("📋").setStyle(ButtonStyle.Secondary).setDisabled(dead),
  );

  return [row1, row2];
}

export function musicPanelPayload(queue: GuildQueue<MusicQueueMeta> | null, color?: string, disabled = false) {
  const track = queue?.currentTrack;
  if (!track || disabled) {
    return {
      embeds: [
        knoxEmbed(color)
          .setTitle("Music")
          .setDescription("Nothing is playing. Use `/play` to start.")
          .setFooter({ text: "Knox music panel" }),
      ],
      components: controlRows(queue, true),
    };
  }

  const upcoming = queue.tracks.toArray();
  const bar = queue.node.createProgressBar() ?? (track.duration || "live");
  const requester = track.requestedBy?.username;
  const embed = knoxEmbed(color ?? queue.metadata?.color)
    .setTitle(queue.node.isPaused() ? "Paused" : "Now playing")
    .setDescription(`**${track.title}**\n${track.author}`)
    .setThumbnail(track.thumbnail)
    .addFields(
      { name: "Progress", value: bar.slice(0, 200) || "live", inline: false },
      { name: "Queue", value: upcoming.length ? `${upcoming.length} left` : "Empty", inline: true },
      { name: "Volume", value: `${volumeOf(queue)}%`, inline: true },
      { name: "Loop", value: loopLabel(queue.repeatMode), inline: true },
    )
    .setFooter({
      text: requester ? `Requested by ${requester}` : track.duration || "Knox",
    });

  if (track.url) embed.setURL(track.url);

  return { embeds: [embed], components: controlRows(queue, false) };
}

async function panelMessage(queue: GuildQueue<MusicQueueMeta>) {
  const meta = queue.metadata;
  if (!meta?.textChannelId || !meta.panelMessageId) return null;
  const channel = queue.guild.channels.cache.get(meta.textChannelId);
  if (!channel?.isTextBased() || channel.isDMBased()) return null;
  return channel.messages.fetch(meta.panelMessageId).catch(() => null);
}

export async function upsertMusicPanel(queue: GuildQueue<MusicQueueMeta>) {
  const meta = queue.metadata;
  if (!meta?.textChannelId) return;
  const channel = queue.guild.channels.cache.get(meta.textChannelId);
  if (!channel?.isTextBased() || channel.isDMBased()) return;
  const payload = musicPanelPayload(queue, meta.color);
  const existing = await panelMessage(queue);
  if (existing) {
    await existing.edit(payload).catch(() => undefined);
    return;
  }
  const sent = await channel.send(payload).catch(() => null);
  if (sent && queue.metadata) {
    queue.metadata.panelMessageId = sent.id;
  }
}

export async function disableMusicPanel(queue: GuildQueue<MusicQueueMeta>) {
  const existing = await panelMessage(queue);
  if (!existing) return;
  await existing
    .edit(musicPanelPayload(queue, queue.metadata?.color, true))
    .catch(() => undefined);
}

function inPlayerVoice(member: GuildMember, queue: GuildQueue<MusicQueueMeta>) {
  const botChannel = member.guild.members.me?.voice.channelId;
  return Boolean(botChannel && member.voice.channelId === botChannel && queue.currentTrack);
}

export async function handleMusicButton(interaction: ButtonInteraction, client: KnoxClient) {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }
  const queue = guildQueue(client, interaction.guild.id);
  if (!queue?.currentTrack) {
    if (interaction.customId === MusicBtn.queue) {
      await interaction.reply({ content: "Queue is empty.", ephemeral: true });
      return;
    }
    await interaction.update(musicPanelPayload(null, undefined, true)).catch(async () => {
      await interaction.reply({ content: "Nothing is playing.", ephemeral: true }).catch(() => undefined);
    });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!inPlayerVoice(member, queue)) {
    await interaction.reply({ content: "Join the voice channel to use the panel.", ephemeral: true });
    return;
  }

  const id = interaction.customId;

  if (id === MusicBtn.queue) {
    const upcoming = queue.tracks.toArray().slice(0, 10);
    const lines = [
      `**Now:** ${queue.currentTrack.title}`,
      ...upcoming.map((track: Track, i: number) => `**${i + 1}.** ${track.title}`),
    ];
    await interaction.reply({
      ephemeral: true,
      embeds: [
        knoxEmbed(queue.metadata?.color)
          .setTitle("Queue")
          .setDescription(lines.join("\n").slice(0, 1900)),
      ],
    });
    return;
  }

  if (id === MusicBtn.pause) {
    if (queue.node.isPaused()) queue.node.resume();
    else queue.node.pause();
  } else if (id === MusicBtn.skip) {
    queue.node.skip();
  } else if (id === MusicBtn.stop) {
    await interaction.update(musicPanelPayload(queue, queue.metadata?.color, true));
    queue.delete();
    return;
  } else if (id === MusicBtn.shuffle) {
    if (queue.tracks.size < 2) {
      await interaction.reply({ content: "Need at least 2 queued tracks to shuffle.", ephemeral: true });
      return;
    }
    queue.tracks.shuffle();
  } else if (id === MusicBtn.voldown) {
    queue.node.setVolume(Math.max(0, volumeOf(queue) - 10));
  } else if (id === MusicBtn.volup) {
    queue.node.setVolume(Math.min(100, volumeOf(queue) + 10));
  } else if (id === MusicBtn.loop) {
    const next =
      queue.repeatMode === QueueRepeatMode.OFF
        ? QueueRepeatMode.TRACK
        : queue.repeatMode === QueueRepeatMode.TRACK
          ? QueueRepeatMode.QUEUE
          : QueueRepeatMode.OFF;
    queue.setRepeatMode(next);
  } else if (id === MusicBtn.prev) {
    const ok = await queue.history.previous().catch(() => false);
    if (!ok) {
      await interaction.reply({ content: "No previous track.", ephemeral: true });
      return;
    }
  }

  await interaction.update(musicPanelPayload(queue, queue.metadata?.color));
}
