import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type GuildMember,
} from "discord.js";
import type { KnoxClient } from "../client.js";
import { knoxEmbed } from "../interactions/embed.js";
import { guildQueue } from "./player-queue.js";
import type { GuildMusic, MusicLoop } from "./music-session.js";
import type { KnoxTrack } from "./youtube.js";
import { fetchLyrics } from "./lyrics.js";

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
  rewind: "knox:music:rewind",
  forward: "knox:music:forward",
  lyrics: "knox:music:lyrics",
  leave: "knox:music:leave",
} as const;

function loopLabel(mode: MusicLoop) {
  if (mode === "track") return "Track";
  if (mode === "queue") return "Queue";
  return "Off";
}

function fmt(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function progressBar(session: GuildMusic, track: KnoxTrack) {
  const elapsed = session.playbackMs() / 1000;
  const total = track.duration || 0;
  if (!total) return fmt(elapsed);
  const ratio = Math.min(1, elapsed / total);
  const filled = Math.round(ratio * 12);
  return `${fmt(elapsed)} ${"▰".repeat(filled)}${"▱".repeat(12 - filled)} ${fmt(total)}`;
}

function controlRows(session: GuildMusic | null, disabled = false) {
  const paused = session?.paused ?? false;
  const looping = session ? session.loop !== "off" : false;
  const dead = disabled || !session?.current;

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

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(MusicBtn.rewind).setEmoji("⏪").setStyle(ButtonStyle.Secondary).setDisabled(dead),
    new ButtonBuilder().setCustomId(MusicBtn.forward).setEmoji("⏩").setStyle(ButtonStyle.Secondary).setDisabled(dead),
    new ButtonBuilder().setCustomId(MusicBtn.lyrics).setEmoji("🎤").setStyle(ButtonStyle.Secondary).setDisabled(dead),
    new ButtonBuilder().setCustomId(MusicBtn.leave).setEmoji("🚪").setStyle(ButtonStyle.Secondary).setDisabled(dead),
  );

  return [row1, row2, row3];
}

export function musicPanelPayload(session: GuildMusic | null, color?: string, disabled = false) {
  const track = session?.current;
  if (!track || disabled) {
    return {
      embeds: [
        knoxEmbed(color)
          .setTitle("Music")
          .setDescription("Nothing is playing. Use `/play` to start.")
          .setFooter({ text: "Knox music panel" }),
      ],
      components: controlRows(session, true),
    };
  }

  const upcoming = session.queue;
  const requester = track.requestedBy;
  const embed = knoxEmbed(color ?? session.meta.color)
    .setTitle(session.paused ? "Paused" : "Now playing")
    .setDescription(`**${track.title}**\n${track.artist}`)
    .setThumbnail(track.thumbnail ?? null)
    .addFields(
      { name: "Progress", value: progressBar(session, track).slice(0, 200), inline: false },
      { name: "Next", value: upcoming[0] ? upcoming[0].title.slice(0, 80) : "Empty", inline: true },
      { name: "Queue", value: upcoming.length ? `${upcoming.length} left` : "Empty", inline: true },
      { name: "Volume", value: `${session.volume}%`, inline: true },
      { name: "Loop", value: loopLabel(session.loop), inline: true },
    )
    .setFooter({
      text: requester ? `Requested by ${requester}` : track.duration ? fmt(track.duration) : "Knox",
    });

  if (track.url) embed.setURL(track.url);

  return { embeds: [embed], components: controlRows(session, false) };
}

async function panelMessage(session: GuildMusic) {
  const meta = session.meta;
  if (!meta.textChannelId || !meta.panelMessageId) return null;
  const channel = session.guild.channels.cache.get(meta.textChannelId);
  if (!channel?.isTextBased() || channel.isDMBased()) return null;
  return channel.messages.fetch(meta.panelMessageId).catch(() => null);
}

export async function upsertMusicPanel(session: GuildMusic) {
  const meta = session.meta;
  if (!meta.textChannelId) return;
  const channel = session.guild.channels.cache.get(meta.textChannelId);
  if (!channel?.isTextBased() || channel.isDMBased()) return;
  const payload = musicPanelPayload(session, meta.color);
  const existing = await panelMessage(session);
  if (existing) {
    await existing.edit(payload).catch(() => undefined);
    return;
  }
  const sent = await channel.send(payload).catch(() => null);
  if (sent) session.meta.panelMessageId = sent.id;
}

export async function disableMusicPanel(session: GuildMusic) {
  const existing = await panelMessage(session);
  if (!existing) return;
  await existing.edit(musicPanelPayload(session, session.meta.color, true)).catch(() => undefined);
}

function inPlayerVoice(member: GuildMember, session: GuildMusic) {
  const botChannel = member.guild.members.me?.voice.channelId;
  return Boolean(botChannel && member.voice.channelId === botChannel && session.current);
}

export async function handleMusicButton(interaction: ButtonInteraction, client: KnoxClient) {
  if (!interaction.guild) {
    await interaction.reply({ content: "Server only.", ephemeral: true });
    return;
  }
  const session = guildQueue(client, interaction.guild.id);
  if (!session?.current) {
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
  if (!inPlayerVoice(member, session)) {
    await interaction.reply({ content: "Join the voice channel to use the panel.", ephemeral: true });
    return;
  }

  const id = interaction.customId;

  if (id === MusicBtn.queue) {
    const upcoming = session.queue.slice(0, 10);
    const lines = [
      `**Now:** ${session.current.title}`,
      ...upcoming.map((track, i) => `**${i + 1}.** ${track.title}`),
    ];
    await interaction.reply({
      ephemeral: true,
      embeds: [
        knoxEmbed(session.meta.color)
          .setTitle("Queue")
          .setDescription(lines.join("\n").slice(0, 1900)),
      ],
    });
    return;
  }

  if (id === MusicBtn.lyrics) {
    await interaction.deferReply({ ephemeral: true });
    const lyrics = await fetchLyrics(session.current.title, session.current.artist);
    if (!lyrics) {
      await interaction.editReply({ content: `No lyrics found for **${session.current.title}**.` });
      return;
    }
    await interaction.editReply({
      embeds: [knoxEmbed(session.meta.color).setTitle(session.current.title.slice(0, 80)).setDescription(lyrics)],
    });
    return;
  }

  if (id === MusicBtn.pause) {
    session.pauseToggle();
  } else if (id === MusicBtn.skip) {
    await session.skip();
  } else if (id === MusicBtn.stop) {
    await interaction.update(musicPanelPayload(session, session.meta.color, true));
    await session.stop();
    return;
  } else if (id === MusicBtn.shuffle) {
    if (session.queue.length < 2) {
      await interaction.reply({ content: "Need at least 2 queued tracks to shuffle.", ephemeral: true });
      return;
    }
    session.shuffle();
  } else if (id === MusicBtn.voldown) {
    session.setVolume(session.volume - 10);
  } else if (id === MusicBtn.volup) {
    session.setVolume(session.volume + 10);
  } else if (id === MusicBtn.loop) {
    session.cycleLoop();
  } else if (id === MusicBtn.prev) {
    const ok = await session.previous();
    if (!ok) {
      await interaction.reply({ content: "No previous track.", ephemeral: true });
      return;
    }
  } else if (id === MusicBtn.rewind) {
    const ok = await session.seekBy(-10);
    if (!ok) {
      await interaction.reply({ content: "Could not seek yet.", ephemeral: true });
      return;
    }
  } else if (id === MusicBtn.forward) {
    const ok = await session.seekBy(10);
    if (!ok) {
      await interaction.reply({ content: "Could not seek yet.", ephemeral: true });
      return;
    }
  } else if (id === MusicBtn.leave) {
    await interaction.update(musicPanelPayload(session, session.meta.color, true));
    await session.stop();
    return;
  }

  await interaction.update(musicPanelPayload(session, session.meta.color));
}
