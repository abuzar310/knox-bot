import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type GuildMember,
  type Message,
} from "discord.js";
import type { KnoxClient } from "../client.js";
import { knoxEmbed } from "../interactions/embed.js";
import { logger } from "../logger.js";
import { guildQueue } from "./player-queue.js";
import { toggleFilter, type GuildMusic, type MusicLoop } from "./music-session.js";
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
  vol25: "knox:music:vol25",
  vol50: "knox:music:vol50",
  vol100: "knox:music:vol100",
  loop: "knox:music:loop",
  queue: "knox:music:queue",
  rewind: "knox:music:rewind",
  forward: "knox:music:forward",
  lyrics: "knox:music:lyrics",
  leave: "knox:music:leave",
  notthis: "knox:music:notthis",
  autoplay: "knox:music:autoplay",
  grab: "knox:music:grab",
  replay: "knox:music:replay",
  bass: "knox:music:bass",
  night: "knox:music:night",
  vapor: "knox:music:vapor",
  normal: "knox:music:normal",
} as const;

function filterLabel(name: string) {
  if (name === "bassboost") return "Bass";
  if (name === "nightcore") return "Night";
  if (name === "vaporwave") return "Vapor";
  return "Off";
}

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

function btn(id: string, emoji: string, label: string, style: ButtonStyle, dead: boolean) {
  return new ButtonBuilder()
    .setCustomId(id)
    .setEmoji(emoji)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(dead);
}

function controlRows(session: GuildMusic | null, disabled = false) {
  const paused = session?.paused ?? false;
  const looping = session ? session.loop !== "off" : false;
  const dead = disabled || !session?.current;

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(MusicBtn.prev, "⏮️", "Prev", ButtonStyle.Secondary, dead),
    btn(MusicBtn.pause, paused ? "▶️" : "⏸️", paused ? "Resume" : "Pause", ButtonStyle.Primary, dead),
    btn(MusicBtn.skip, "⏭️", "Skip", ButtonStyle.Secondary, dead),
    btn(MusicBtn.stop, "⏹️", "Stop", ButtonStyle.Danger, dead),
    btn(MusicBtn.shuffle, "🔀", "Shuffle", ButtonStyle.Secondary, dead),
  );

  const vol = session?.volume ?? 100;
  const autoOn = session?.autoplay ?? false;
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(MusicBtn.vol25, "🔉", "25%", vol === 25 ? ButtonStyle.Success : ButtonStyle.Secondary, dead),
    btn(MusicBtn.vol50, "🔉", "50%", vol === 50 ? ButtonStyle.Success : ButtonStyle.Secondary, dead),
    btn(MusicBtn.vol100, "🔊", "100%", vol === 100 ? ButtonStyle.Success : ButtonStyle.Secondary, dead),
    btn(MusicBtn.loop, "🔁", `Loop ${loopLabel(session?.loop ?? "off")}`, looping ? ButtonStyle.Success : ButtonStyle.Secondary, dead),
    btn(MusicBtn.autoplay, "📻", autoOn ? "Auto on" : "Auto off", autoOn ? ButtonStyle.Success : ButtonStyle.Secondary, dead),
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(MusicBtn.rewind, "⏪", "−10s", ButtonStyle.Secondary, dead),
    btn(MusicBtn.forward, "⏩", "+10s", ButtonStyle.Secondary, dead),
    btn(MusicBtn.lyrics, "🎤", "Lyrics", ButtonStyle.Secondary, dead),
    btn(MusicBtn.notthis, "👎", "Not this", ButtonStyle.Secondary, dead),
    btn(MusicBtn.leave, "🚪", "Leave", ButtonStyle.Secondary, dead),
  );

  const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(MusicBtn.grab, "🔗", "Grab", ButtonStyle.Secondary, dead),
    btn(MusicBtn.replay, "🔂", "Replay", ButtonStyle.Secondary, dead),
    btn(MusicBtn.bass, "🔊", "Bass", session?.filterName === "bassboost" ? ButtonStyle.Success : ButtonStyle.Secondary, dead),
    btn(MusicBtn.night, "⚡", "Night", session?.filterName === "nightcore" ? ButtonStyle.Success : ButtonStyle.Secondary, dead),
    btn(MusicBtn.vapor, "🌊", "Vapor", session?.filterName === "vaporwave" ? ButtonStyle.Success : ButtonStyle.Secondary, dead),
  );

  const effectOff = !session || session.filterName === "off";
  const row5 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    btn(MusicBtn.normal, "✖️", "Filter off", effectOff ? ButtonStyle.Success : ButtonStyle.Secondary, dead),
  );

  return [row1, row2, row3, row4, row5];
}

export function musicPanelPayload(session: GuildMusic | null, color?: string, disabled = false) {
  const track = session?.current;
  if (!track || disabled) {
    return {
      content: "",
      embeds: [
        knoxEmbed(color)
          .setTitle("Music")
          .setDescription("Nothing is playing. Use `?play` or type a song name in the music channel.")
          .setFooter({ text: "ZARU music panel" }),
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
      { name: "Filter", value: filterLabel(session.filterName), inline: true },
    )
    .setFooter({
      text: requester ? `Requested by ${requester}` : track.duration ? fmt(track.duration) : "ZARU",
    });

  if (track.url) embed.setURL(track.url);

  return { content: "", embeds: [embed], components: controlRows(session, false) };
}

/** one page of the queue, ten songs at a time, with previous and next when there is more */
export function queuePage(session: GuildMusic, page: number) {
  const pageSize = 10;
  const pages = Math.max(1, Math.ceil(session.queue.length / pageSize));
  const safe = Math.min(pages - 1, Math.max(0, page));
  const slice = session.queue.slice(safe * pageSize, safe * pageSize + pageSize);
  const lines = [`**Now:** ${session.current?.title ?? "—"}`, ...slice.map((track, i) => `**${safe * pageSize + i + 1}.** ${track.title}`)];
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${MUSIC_PREFIX}q:${safe - 1}`).setLabel("Prev").setStyle(ButtonStyle.Secondary).setDisabled(safe <= 0),
    new ButtonBuilder().setCustomId(`${MUSIC_PREFIX}q:${safe + 1}`).setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(safe >= pages - 1),
  );
  return {
    embeds: [
      knoxEmbed(session.meta.color)
        .setTitle(`Queue (${session.queue.length}) · ${safe + 1}/${pages}`)
        .setDescription(lines.join("\n").slice(0, 1900) || "Empty"),
    ],
    components: pages > 1 ? [row] : [],
  };
}

type PanelChannel = {
  send: (payload: ReturnType<typeof musicPanelPayload>) => Promise<Message>;
  messages: { fetch: (id: string) => Promise<Message> };
};

function panelChannel(session: GuildMusic): PanelChannel | null {
  const raw = session.guild.channels.cache.get(session.meta.textChannelId) as
    | (PanelChannel & { isDMBased?: () => boolean })
    | undefined;
  if (!raw || raw.isDMBased?.()) return null;
  if (typeof raw.send !== "function" || !raw.messages) return null;
  return raw;
}

async function panelMessage(session: GuildMusic) {
  const meta = session.meta;
  if (!meta.textChannelId || !meta.panelMessageId) return null;
  const channel = panelChannel(session);
  if (!channel) return null;
  return channel.messages.fetch(meta.panelMessageId).catch(() => null);
}

function isMusicPanel(message: Message) {
  return message.components.some((row) =>
    row.components.some((component) => "customId" in component && String(component.customId).startsWith(MUSIC_PREFIX)),
  );
}

/** the panel posted before a restart, so the new Off button lands on the message people are looking at */
async function recentPanel(session: GuildMusic): Promise<Message | null> {
  const channel = session.guild.channels.cache.get(session.meta.textChannelId);
  if (!channel?.isTextBased() || channel.isDMBased()) return null;
  const recent = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  if (!recent) return null;
  const mine = recent.find((message) => message.author.id === session.client.user?.id && isMusicPanel(message));
  return mine ?? null;
}

export async function upsertMusicPanel(session: GuildMusic, create = false) {
  const meta = session.meta;
  if (!meta.textChannelId) return;
  const channel = panelChannel(session);
  if (!channel) return;
  const payload = musicPanelPayload(session, meta.color);
  const existing = (await panelMessage(session)) ?? (await recentPanel(session));
  if (existing) {
    session.meta.panelMessageId = existing.id;
    await existing.edit(payload).catch(() => undefined);
    return;
  }
  if (!create && !meta.panelMessageId) return;
  const sent = await channel.send(payload).catch((err: unknown) => {
    logger.warn({ err, channelId: meta.textChannelId }, "music panel send failed");
    return null;
  });
  if (sent) session.meta.panelMessageId = (sent as Message).id;
}

export async function disableMusicPanel(session: GuildMusic) {
  const existing = await panelMessage(session);
  if (!existing) return;
  await existing.edit(musicPanelPayload(session, session.meta.color, true)).catch(() => undefined);
}

function paintPanel(interaction: ButtonInteraction, session: GuildMusic | null, disabled = false) {
  const payload = musicPanelPayload(session, session?.meta.color, disabled);
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.update(payload);
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
    if (interaction.customId === MusicBtn.queue || interaction.customId.startsWith(`${MUSIC_PREFIX}q:`)) {
      await interaction.reply({ content: "Queue is empty.", ephemeral: true });
      return;
    }
    await paintPanel(interaction, null, true).catch(async () => {
      await interaction.reply({ content: "Nothing is playing.", ephemeral: true }).catch(() => undefined);
    });
    return;
  }

  const id = interaction.customId;
  if (id === MusicBtn.queue || id.startsWith(`${MUSIC_PREFIX}q:`)) {
    const page = id.startsWith(`${MUSIC_PREFIX}q:`) ? Number(id.slice(`${MUSIC_PREFIX}q:`.length)) : 0;
    const payload = queuePage(session, Number.isFinite(page) ? page : 0);
    if (id.startsWith(`${MUSIC_PREFIX}q:`)) await interaction.update(payload);
    else await interaction.reply({ ...payload, ephemeral: true });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!inPlayerVoice(member, session)) {
    await interaction.reply({ content: "Join the voice channel to use the panel.", ephemeral: true });
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
    await paintPanel(interaction, session, true);
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
  } else if (id === MusicBtn.vol25) {
    session.setVolume(25);
  } else if (id === MusicBtn.vol50) {
    session.setVolume(50);
  } else if (id === MusicBtn.vol100) {
    session.setVolume(100);
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
  } else if (id === MusicBtn.notthis) {
    await interaction.deferUpdate();
    const ok = await session.notThis();
    if (!ok) {
      await interaction.followUp({ content: "No other version found.", ephemeral: true });
    }
    return;
  } else if (id === MusicBtn.autoplay) {
    session.autoplay = !session.autoplay;
  } else if (id === MusicBtn.grab) {
    const body = `**${session.current.title}**\n${session.current.url}`;
    const sent = await interaction.user.send({ content: body }).then(() => true, () => false);
    await interaction.reply({ content: sent ? "Sent you the song." : body, ephemeral: true });
    return;
  } else if (id === MusicBtn.replay) {
    const ok = await session.seekTo(0);
    if (!ok) {
      await interaction.reply({ content: "Could not restart that yet.", ephemeral: true });
      return;
    }
  } else if (id === MusicBtn.bass || id === MusicBtn.night || id === MusicBtn.vapor || id === MusicBtn.normal) {
    await interaction.deferUpdate();
    const picked = id === MusicBtn.bass ? "bassboost" : id === MusicBtn.night ? "nightcore" : id === MusicBtn.vapor ? "vaporwave" : "off";
    await session.setFilter(toggleFilter(session.filterName, picked));
    await paintPanel(interaction, session);
    return;
  } else if (id === MusicBtn.leave) {
    await paintPanel(interaction, session, true);
    await session.stop();
    return;
  }

  await paintPanel(interaction, session);
}
