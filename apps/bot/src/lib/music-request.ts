// Playing and controlling music from a normal message, not only from /play.
import { PermissionFlagsBits, type GuildMember, type Message } from "discord.js";
import type { KnoxClient } from "../client.js";
import { knoxEmbed } from "../interactions/embed.js";
import { fetchLyrics } from "./lyrics.js";
import { playErrorMessage } from "./music-session.js";
import { musicPanelPayload, queuePage, upsertMusicPanel } from "./music-panel.js";
import type { MusicAsk } from "./music-words.js";
import { guildQueue } from "./player-queue.js";
import { playVoice } from "./music-room.js";
import { listeners, memberMayControl, memberVoiceChannel, registerSkipVote } from "./voice-gate.js";
import { resolvePlayQuery } from "./youtube.js";

const quiet = { repliedUser: false as const };

async function say(message: Message, content: string) {
  await message.reply({ content, allowedMentions: quiet }).catch(() => undefined);
}

async function playFromMember(message: Message, client: KnoxClient, member: GuildMember, query: string) {
  const guild = member.guild;
  const alwaysId = client.guildConfig.peek(guild.id)?.settings.features.alwaysVoiceChannelId ?? null;
  const found = playVoice(guild, member, alwaysId);
  if ("error" in found) {
    await say(message, found.error);
    return;
  }
  const channel = found.channel;
  const me = guild.members.me;
  if (me) {
    const perms = channel.permissionsFor(me);
    if (!perms?.has(PermissionFlagsBits.Connect) || !perms.has(PermissionFlagsBits.Speak)) {
      await say(message, "I need Connect and Speak in that voice channel.");
      return;
    }
  }
  const manager = client.music;
  if (!manager) {
    await say(message, "Music is still starting. Try again in a few seconds.");
    return;
  }
  const color = client.guildConfig.peek(guild.id)?.settings.embedColor;
  try {
    const result = await resolvePlayQuery(query, member.displayName);
    if (!result.tracks.length) {
      await say(message, "No tracks found. Try a YouTube link or another name.");
      return;
    }
    const existing = guildQueue(client, guild.id);
    const session = manager.getOrCreate(guild, channel, {
      textChannelId: existing?.meta.textChannelId ?? message.channel.id,
      color: existing?.meta.color ?? color,
      panelMessageId: existing?.meta.panelMessageId,
    });
    const played = await session.addAndPlay(result.tracks);
    const extra = result.tracks.length > 1 ? ` + ${result.tracks.length - 1} more` : "";
    if (played.alreadyPlaying) {
      await say(message, `Added **${played.preview.title}**${extra} to the queue.`);
      await upsertMusicPanel(session);
      return;
    }
    const samePanel = session.meta.textChannelId === message.channel.id && session.meta.panelMessageId;
    if (samePanel) {
      await upsertMusicPanel(session);
      await say(message, `Playing **${session.current?.title ?? played.preview.title}**. The panel is in this channel.`);
    } else {
      const reply = await message.reply({ ...musicPanelPayload(session, color), allowedMentions: quiet });
      session.meta.panelMessageId = reply.id;
      session.meta.textChannelId = message.channel.id;
      session.meta.color = color;
    }
  } catch (error) {
    await say(message, playErrorMessage(error));
  }
}

/** runs the ask and replies on the message. False when this message is not something music should take. */
export async function runMusicAsk(message: Message, client: KnoxClient, ask: MusicAsk): Promise<boolean> {
  if (!message.guild || !message.member) return false;
  const channel = message.channel;
  if (!channel.isTextBased() || channel.isDMBased()) return false;
  const member = message.member;
  const guild = message.guild;
  if (ask.kind === "play") {
    await playFromMember(message, client, member, ask.query);
    return true;
  }

  const session = guildQueue(client, guild.id);
  if (!session?.current) {
    await say(message, "Nothing is playing.");
    return true;
  }

  if (ask.kind === "queue") {
    await message.reply({ ...queuePage(session, 0), allowedMentions: quiet }).catch(() => undefined);
    return true;
  }
  if (ask.kind === "lyrics") {
    const lyrics = await fetchLyrics(session.current.title, session.current.artist);
    await message
      .reply({
        content: lyrics ? undefined : `No lyrics found for **${session.current.title}**.`,
        embeds: lyrics ? [knoxEmbed(session.meta.color).setTitle(session.current.title.slice(0, 80)).setDescription(lyrics)] : [],
        allowedMentions: quiet,
      })
      .catch(() => undefined);
    return true;
  }
  if (ask.kind === "grab") {
    const body = `**${session.current.title}**\n${session.current.url}`;
    const sent = await message.author.send({ content: body }).then(() => true, () => false);
    await say(message, sent ? "Sent you the song." : body);
    return true;
  }

  const missing = await memberMayControl(client, member);
  if (missing) {
    await say(message, missing);
    return true;
  }
  const djOnly = await memberMayControl(client, member, { dj: true });

  if (ask.kind === "skip") {
    if (djOnly) {
      const voice = memberVoiceChannel(member);
      const needed = Math.max(2, Math.ceil(listeners(voice) / 2));
      const vote = registerSkipVote(guild.id, session.current.url, message.author.id, needed);
      if (!vote.passed) {
        await say(message, `Vote to skip **${session.current.title}**: **${vote.count}/${vote.needed}**.`);
        return true;
      }
    }
    const title = session.current.title;
    await session.skip();
    await say(message, `Skipped **${title}**.`);
    return true;
  }

  if (djOnly) {
    await say(message, djOnly);
    return true;
  }

  if (ask.kind === "pause") {
    if (!session.paused) session.pauseToggle();
    await say(message, "Paused.");
  } else if (ask.kind === "resume") {
    if (session.paused) session.pauseToggle();
    await say(message, "Playing.");
  } else if (ask.kind === "stop" || ask.kind === "leave") {
    await session.stop();
    await say(message, ask.kind === "leave" ? "Left the voice channel." : "Stopped.");
    return true;
  } else if (ask.kind === "shuffle") {
    if (session.queue.length < 2) {
      await say(message, "Need at least 2 songs in the queue to shuffle.");
      return true;
    }
    session.shuffle();
    await say(message, "Shuffled the queue.");
  } else if (ask.kind === "loop") {
    const mode = session.cycleLoop();
    await say(message, `Loop is **${mode}**.`);
  } else if (ask.kind === "replay") {
    const ok = await session.seekTo(0);
    await say(message, ok ? "Started the song again." : "Could not restart that yet.");
    return true;
  } else if (ask.kind === "volume") {
    session.setVolume(ask.value);
    await say(message, `Volume **${session.volume}%**.`);
  } else if (ask.kind === "filter") {
    const applied = await session.setFilter(ask.name);
    if (applied === "unknown") {
      await say(message, `I don't know **${ask.name}**. Try bassboost, nightcore, slowed, vaporwave, daycore, 8d, karaoke, or off.`);
      return true;
    }
    await say(message, ask.name === "off" ? "Filter off." : `Filter **${ask.name}** on.`);
  }
  await upsertMusicPanel(session).catch(() => undefined);
  return true;
}
