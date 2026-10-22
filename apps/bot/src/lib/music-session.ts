import { createRequire } from "node:module";
import fs from "node:fs";
import { Readable } from "node:stream";
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  generateDependencyReport,
  joinVoiceChannel,
  type AudioPlayer,
  type AudioResource,
  type VoiceConnection,
} from "@discordjs/voice";
import { ChannelType, type Guild, type VoiceBasedChannel } from "discord.js";
import type { KnoxClient } from "../client.js";
import { logger } from "../logger.js";

/** longest queue a server may build */
const MAX_QUEUE = 250;
import {
  deleteCachedFile,
  downloadTrackAudio,
  isSoundCloudURL,
  isYouTubeURL,
  soundcloudSearch,
  youtubeSearch,
  youtubeStreamUrl,
  searchByName,
  isJunkTrack,
  type KnoxTrack,
} from "./youtube.js";
import { refreshYtDlp } from "./yt-stream.js";
import { moveQueueItem, stripQueueDupes, fairInsert, isFillerTrack } from "./queue-ops.js";
import {
  alwaysVoiceChannel,
  alwaysVoiceGuilds,
  alwaysVoiceHeld,
  holdAlwaysVoice,
  isAlwaysVoice,
  refreshAlwaysVoice,
  releaseAlwaysVoice,
} from "./always-voice.js";

const require = createRequire(import.meta.url);
const ffmpegPath = require("ffmpeg-static") as string | null;
const prism = require("prism-media") as {
  FFmpeg: new (opts: { command?: string; args: string[] }) => Readable & NodeJS.WritableStream;
};

export function playErrorMessage(error: unknown) {
  const err = error as { message?: string; stderr?: string };
  const raw = `${err?.message ?? ""} ${err?.stderr ?? ""}`;
  if (/Sign in to confirm you're not a bot|403|Forbidden/i.test(raw)) {
    return "YouTube blocked the audio. Try again in a few seconds, or paste a YouTube / SoundCloud link.";
  }
  if (/timeout|ETIMEDOUT|killed/i.test(raw)) {
    return "Download timed out. Try once more.";
  }
  if (/format is not available/i.test(raw)) {
    return "YouTube had no audio for that link. Try the name again.";
  }
  return "Could not play that. Try a YouTube link or another name.";
}

export type MusicLoop = "off" | "track" | "queue";

export type MusicQueueMeta = {
  textChannelId: string;
  color?: string;
  panelMessageId?: string;
};

export class GuildMusic {
  queue: KnoxTrack[] = [];
  current: KnoxTrack | null = null;
  history: KnoxTrack[] = [];
  volume = 100;
  loop: MusicLoop = "off";
  meta: MusicQueueMeta;
  onChange?: () => Promise<void> | void;

  private connection: VoiceConnection | null = null;
  private readonly player: AudioPlayer;
  private resource: AudioResource | null = null;
  private startedAt: number | null = null;
  private pausedMs = 0;
  private pauseStarted: number | null = null;
  private transitioning = false;
  private stopRequested = false;
  private skipRequested = false;
  private leaveTimer: ReturnType<typeof setTimeout> | null = null;
  private emptyTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private lastError: unknown = null;
  private startOffsetMs = 0;
  private currentFile: string | null = null;
  autoplay = false;
  private reconnecting = false;
  private ignoreDisconnect = false;
  private autoReconnectAt: number[] = [];

  constructor(
    readonly client: KnoxClient,
    readonly guild: Guild,
    public voiceChannel: VoiceBasedChannel,
    meta: MusicQueueMeta,
  ) {
    this.meta = meta;
    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Play },
    });
    this.player.on(AudioPlayerStatus.Playing, () => {
      this.transitioning = false;
      if (!this.startedAt) this.startedAt = Date.now();
    });
    this.player.on(AudioPlayerStatus.Idle, () => {
      void this.handleTrackEnd("idle");
    });
    this.player.on("error", (error) => {
      logger.warn({ err: error }, "music player error");
      void this.handleTrackEnd("error");
    });
    this.player.on(AudioPlayerStatus.AutoPaused, () => {
      setTimeout(() => {
        if (this.destroyed || this.reconnecting || !this.current) return;
        if (this.player.state.status !== AudioPlayerStatus.AutoPaused) return;
        logger.warn({ guildId: this.guild.id }, "voice went silent, reconnecting");
        void this.reconnectVoice();
      }, 2_000);
    });
  }

  get paused() {
    return this.player.state.status === AudioPlayerStatus.Paused || this.player.state.status === AudioPlayerStatus.AutoPaused;
  }

  playbackMs() {
    if (!this.startedAt) return this.startOffsetMs;
    const extra = this.pauseStarted ? Date.now() - this.pauseStarted : 0;
    return this.startOffsetMs + (Date.now() - this.startedAt) - this.pausedMs - extra;
  }

  async addAndPlay(tracks: KnoxTrack[]) {
    if (!tracks.length) throw new Error("No tracks found");
    if (!isFillerTrack(tracks[0])) releaseAlwaysVoice(this.guild.id);
    this.cancelLeave();
    if (this.current && isFillerTrack(this.current) && !isFillerTrack(tracks[0])) {
      this.queue = this.queue.filter((track) => !isFillerTrack(track));
      await this.playSkip(tracks);
      return { alreadyPlaying: false, preview: tracks[0] };
    }
    const alreadyPlaying = Boolean(this.current);
    if (alreadyPlaying) fairInsert(this.queue, tracks);
    else this.queue.push(...tracks);
    if (!alreadyPlaying) {
      await this.playNext();
      if (!this.current) throw this.lastError instanceof Error ? this.lastError : new Error("Could not play that track");
    } else {
      await this.emitChange();
    }
    return { alreadyPlaying, preview: tracks[0] };
  }

  async addNext(tracks: KnoxTrack[]) {
    if (!this.current) return this.addAndPlay(tracks);
    if (!tracks.length) throw new Error("No tracks found");
    this.queue.unshift(...tracks);
    await this.emitChange();
    return { alreadyPlaying: true as const, preview: tracks[0] };
  }

  async enqueue(tracks: KnoxTrack[]) {
    if (!tracks.length) throw new Error("No tracks found");
    // a queue has a ceiling: a 2,000-track playlist must not eat the memory of a small host
    const room = MAX_QUEUE - this.queue.length;
    if (room <= 0) throw new Error(`The queue is full (${MAX_QUEUE} tracks). Skip or clear some first.`);
    if (tracks.length > room) tracks = tracks.slice(0, room);
    if (!isFillerTrack(tracks[0])) releaseAlwaysVoice(this.guild.id);
    this.cancelLeave();
    if (!this.current) {
      this.queue.push(...tracks);
      await this.playNext();
      if (!this.current) throw this.lastError instanceof Error ? this.lastError : new Error("Could not play that track");
      return { alreadyPlaying: false, preview: tracks[0] };
    }
    this.queue.push(...tracks);
    await this.emitChange();
    return { alreadyPlaying: true, preview: tracks[0] };
  }

  removeAt(position: number) {
    const index = position - 1;
    if (index < 0 || index >= this.queue.length) return null;
    return this.queue.splice(index, 1)[0] ?? null;
  }

  move(from: number, to: number) {
    return moveQueueItem(this.queue, from, to);
  }

  removeDupes() {
    return stripQueueDupes(this.queue, this.current);
  }

  async playSkip(tracks: KnoxTrack[]) {
    if (!this.current) return this.addAndPlay(tracks);
    if (!tracks.length) throw new Error("No tracks found");
    this.cancelLeave();
    this.queue = this.queue.filter((track) => !isFillerTrack(track));
    this.queue.unshift(...tracks);
    this.skipRequested = true;
    this.player.stop(true);
    return { alreadyPlaying: true as const, preview: tracks[0] };
  }

  async join() {
    this.cancelLeave();
    try {
      if (this.connection?.state.status === VoiceConnectionStatus.Ready) return true;
      if (this.current) return this.reconnectVoice(true);
      await this.connect();
      return true;
    } catch (error) {
      logger.warn({ err: error, guildId: this.guild.id }, "join failed");
      return false;
    }
  }

  async reconnectVoice(force = false) {
    if (this.destroyed || this.reconnecting) return false;
    if (!force && !this.allowAutoReconnect()) {
      logger.warn({ guildId: this.guild.id }, "voice reconnect skipped (too many tries)");
      return false;
    }
    this.reconnecting = true;
    const offsetMs = this.playbackMs();
    try {
      this.dropConnection();
      await this.connect();
      if (this.current && this.currentFile) {
        const ok = await this.seekTo(offsetMs / 1000);
        if (!ok && this.player.state.status === AudioPlayerStatus.AutoPaused) this.player.unpause();
      } else if (this.player.state.status === AudioPlayerStatus.AutoPaused) {
        this.player.unpause();
      }
      logger.info({ guildId: this.guild.id, offsetMs }, "voice reconnected");
      await this.emitChange();
      return true;
    } catch (error) {
      logger.warn({ err: error, guildId: this.guild.id }, "voice reconnect failed");
      return false;
    } finally {
      this.reconnecting = false;
    }
  }

  async notThis() {
    const track = this.current;
    if (!track) return false;
    const query = track.query || `${track.title} ${track.artist}`.trim();
    const exclude = [track.url, track.youtubeUrl].filter((url): url is string => Boolean(url));
    const found = await searchByName(query, exclude);
    const next = found[0];
    if (!next) return false;
    this.queue.unshift({ ...next, requestedBy: track.requestedBy });
    this.skipRequested = true;
    this.player.stop(true);
    return true;
  }

  async skipTo(position: number) {
    const index = position - 1;
    if (index < 0 || index >= this.queue.length) return false;
    const target = this.queue.splice(index, 1)[0];
    if (!target) return false;
    if (this.current) this.history.push(this.current);
    this.queue.unshift(target);
    this.skipRequested = true;
    this.player.stop(true);
    return true;
  }

  clearQueue() {
    this.queue = [];
  }

  async seekTo(seconds: number) {
    if (!this.current || !this.currentFile) return false;
    const duration = this.current.duration || 0;
    const clamped = Math.max(0, duration ? Math.min(seconds, Math.max(0, duration - 1)) : seconds);
    this.startOffsetMs = clamped * 1000;
    this.pausedMs = 0;
    this.pauseStarted = null;
    this.startedAt = null;
    this.transitioning = true;
    this.resource = this.resourceFromFile(this.currentFile, this.startOffsetMs);
    this.resource.volume?.setVolume(this.volume / 100);
    this.player.play(this.resource);
    await entersState(this.player, AudioPlayerStatus.Playing, 15_000);
    this.startedAt = Date.now();
    this.transitioning = false;
    await this.emitChange();
    return true;
  }

  async seekBy(deltaSeconds: number) {
    const next = this.playbackMs() / 1000 + deltaSeconds;
    return this.seekTo(next);
  }

  setLoop(mode: MusicLoop) {
    this.loop = mode;
    return this.loop;
  }

  async skip() {
    if (!this.current) return false;
    this.skipRequested = true;
    this.player.stop(true);
    return true;
  }

  async previous() {
    const prev = this.history.pop();
    if (!prev) return false;
    this.transitioning = true;
    if (this.current) this.queue.unshift(this.current);
    this.current = prev;
    await this.playCurrent();
    return true;
  }

  pauseToggle() {
    if (this.paused) {
      this.player.unpause();
      if (this.pauseStarted) {
        this.pausedMs += Date.now() - this.pauseStarted;
        this.pauseStarted = null;
      }
      return "resumed";
    }
    const ok = this.player.pause();
    if (ok) this.pauseStarted = Date.now();
    return ok ? "paused" : "paused";
  }

  shuffle() {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
  }

  cycleLoop() {
    this.loop = this.loop === "off" ? "track" : this.loop === "track" ? "queue" : "off";
    return this.loop;
  }

  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(100, Math.round(value)));
    this.resource?.volume?.setVolume(this.volume / 100);
  }

  async stop() {
    holdAlwaysVoice(this.guild.id);
    this.ignoreDisconnect = true;
    this.stopRequested = true;
    this.queue = [];
    this.current = null;
    this.player.stop(true);
    this.destroy();
  }

  destroy() {
    if (this.destroyed) return;
    this.ignoreDisconnect = true;
    this.destroyed = true;
    this.cancelLeave();
    this.stopRequested = true;
    this.queue = [];
    const url = this.current?.youtubeUrl || this.current?.url;
    this.current = null;
    try {
      this.player.stop(true);
    } catch {
      /* ignore */
    }
    try {
      this.connection?.destroy();
    } catch {
      /* ignore */
    }
    this.connection = null;
    if (url) deleteCachedFile(url);
    this.client.music?.drop(this.guild.id);
    void this.emitChange();
  }

  onVoiceState() {
    const mine = this.guild.members.me?.voice.channel;
    if (mine) this.voiceChannel = mine;
    const channel = mine ?? this.voiceChannel;
    const humans = channel.members.filter((member) => !member.user.bot).size;
    if (humans === 0) {
      if (isAlwaysVoice(this.guild.id, channel.id)) return;
      if (this.emptyTimer) return;
      this.emptyTimer = setTimeout(() => this.destroy(), 60_000);
      return;
    }
    if (this.emptyTimer) {
      clearTimeout(this.emptyTimer);
      this.emptyTimer = null;
    }
  }

  private async playNext() {
    if (!this.queue.length && this.autoplay) await this.enqueueRadio();
    const next = this.queue.shift();
    if (!next) {
      this.current = null;
      this.transitioning = false;
      if (!isAlwaysVoice(this.guild.id, this.voiceChannel.id)) this.scheduleLeave();
      await this.emitChange();
      return;
    }
    this.current = next;
    await this.playCurrent();
  }

  private async enqueueRadio() {
    const seed = this.current || this.history.at(-1);
    if (!seed) return;
    const exclude = [seed.url, seed.youtubeUrl, ...this.history.map((track) => track.url)].filter(
      (url): url is string => Boolean(url),
    );
    try {
      const found = await searchByName(seed.query || seed.title, exclude);
      if (found[0]) this.queue.push({ ...found[0], requestedBy: "autoplay" });
    } catch (error) {
      logger.warn({ err: error }, "autoplay search failed");
    }
  }

  private async playCurrent() {
    const track = this.current;
    if (!track) return;
    this.stopRequested = false;
    this.skipRequested = false;
    this.transitioning = true;
    this.startedAt = null;
    this.startOffsetMs = 0;
    this.pausedMs = 0;
    this.pauseStarted = null;
    this.currentFile = null;
    try {
      const playUrl = await this.resolvePlayUrl(track);
      if (this.skipRequested || this.stopRequested) {
        this.skipRequested = false;
        if (this.stopRequested) return;
        this.current = null;
        await this.playNext();
        return;
      }

      let file: string | null = null;
      try {
        file = await downloadTrackAudio(playUrl, isYouTubeURL(playUrl));
        logger.info({ title: track.title, bytes: fs.statSync(file).size }, "audio cached");
      } catch (error) {
        this.lastError = error;
        logger.warn({ err: error, url: playUrl }, "yt-dlp download failed, trying SoundCloud");
        if (!isSoundCloudURL(playUrl)) {
          try {
            const alt = await soundcloudSearch(`${track.title} ${track.artist}`.trim() || track.title, 5);
            const pick = alt.find(
              (t) => !isJunkTrack(t, track.query || track.title) && !/slowed|reverb|sped up|nightcore|8d/i.test(t.title),
            );
            if (pick?.url) {
              file = await downloadTrackAudio(pick.url, false);
              track.platform = "soundcloud";
              track.url = pick.url;
              logger.info({ title: track.title, bytes: fs.statSync(file).size }, "audio cached from SoundCloud");
            }
          } catch (scError) {
            this.lastError = scError;
            logger.warn({ err: scError }, "SoundCloud fallback failed");
          }
        }
      }
      if (this.skipRequested || this.stopRequested) {
        this.skipRequested = false;
        if (this.stopRequested) return;
        this.current = null;
        await this.playNext();
        return;
      }

      await this.connect();
      if (file) {
        this.currentFile = file;
        this.resource = this.resourceFromFile(file);
      } else if (!isYouTubeURL(playUrl)) {
        this.resource = await this.resourceFromStream(playUrl);
      } else {
        throw this.lastError instanceof Error ? this.lastError : new Error("YouTube blocked this download (403)");
      }
      this.resource.volume?.setVolume(this.volume / 100);
      this.player.play(this.resource);
      await entersState(this.player, AudioPlayerStatus.Playing, 20_000);
      this.transitioning = false;
      logger.info({ title: track.title }, "now playing");
      void this.emitChange();
    } catch (error) {
      this.transitioning = false;
      this.lastError = error;
      logger.warn({ err: error, title: track.title }, "track play failed");
      this.current = null;
      if (this.queue.length) await this.playNext();
    }
  }

  private async resolvePlayUrl(track: KnoxTrack) {
    if (track.youtubeUrl) return track.youtubeUrl;
    if (track.platform === "youtube" || isYouTubeURL(track.url) || isSoundCloudURL(track.url) || track.platform === "direct") {
      return track.url;
    }
    const results = await youtubeSearch(`${track.title} ${track.artist}`, 1);
    const url = results[0]?.url;
    if (!url) throw new Error("Could not find YouTube equivalent");
    track.youtubeUrl = url;
    return url;
  }

  private resourceFromFile(file: string, seekMs = 0) {
    if (!fs.existsSync(file) || fs.statSync(file).size < 1000) {
      throw new Error("Cached audio file is missing");
    }
    const seekArgs = seekMs > 0 ? ["-ss", (seekMs / 1000).toFixed(3)] : [];
    const ffmpeg = new prism.FFmpeg({
      command: ffmpegPath ?? undefined,
      args: [...seekArgs, "-i", file, "-analyzeduration", "0", "-loglevel", "0", "-f", "s16le", "-ar", "48000", "-ac", "2"],
    });
    return createAudioResource(ffmpeg, {
      inputType: StreamType.Raw,
      inlineVolume: true,
      metadata: this.current,
    });
  }

  private async resourceFromStream(url: string) {
    const info = await youtubeStreamUrl(url);
    const response = await fetch(info.url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ...info.headers,
      },
    });
    if (!response.ok || !response.body) throw new Error(`Failed to fetch stream: ${response.status}`);
    const audioStream =
      typeof Readable.fromWeb === "function" ? Readable.fromWeb(response.body as never) : (response.body as unknown as Readable);
    const ffmpeg = new prism.FFmpeg({
      command: ffmpegPath ?? undefined,
      args: ["-analyzeduration", "0", "-loglevel", "0", "-i", "pipe:0", "-f", "s16le", "-ar", "48000", "-ac", "2"],
    });
    audioStream.pipe(ffmpeg);
    return createAudioResource(ffmpeg, {
      inputType: StreamType.Raw,
      inlineVolume: true,
      metadata: this.current,
    });
  }

  private async handleTrackEnd(reason: string) {
    if (this.destroyed) return;
    if (this.transitioning) return;
    if (this.stopRequested) {
      this.destroy();
      return;
    }
    if (this.player.state.status !== AudioPlayerStatus.Idle && reason === "idle") return;
    const finished = this.current;
    if (!finished) return;
    if (!this.startedAt && reason !== "skip" && !this.skipRequested) {
      logger.warn({ title: finished.title, reason }, "track ended before playback started");
      return;
    }
    this.transitioning = true;
    if (this.skipRequested) {
      this.skipRequested = false;
      this.history.push(finished);
      if (this.history.length > 20) this.history.shift();
      this.current = null;
      await this.playNext();
      return;
    }
    if (this.loop === "track") {
      await this.playCurrent();
      return;
    }
    this.history.push(finished);
    if (this.history.length > 20) this.history.shift();
    deleteCachedFile(finished.youtubeUrl || finished.url);
    if (this.loop === "queue") this.queue.push(finished);
    this.current = null;
    await this.playNext();
  }

  // ponytail: 3 auto-reconnects / 30s; raise if Discord voice flaps more than that
  private allowAutoReconnect() {
    const now = Date.now();
    this.autoReconnectAt = this.autoReconnectAt.filter((t) => now - t < 30_000);
    if (this.autoReconnectAt.length >= 3) return false;
    this.autoReconnectAt.push(now);
    return true;
  }

  private dropConnection() {
    this.ignoreDisconnect = true;
    const conn = this.connection;
    this.connection = null;
    try {
      conn?.destroy();
    } catch {
      /* ignore */
    }
  }

  private watchConnection(conn: VoiceConnection) {
    conn.on("stateChange", (_old, next) => {
      if (this.ignoreDisconnect || this.destroyed || this.stopRequested || this.reconnecting) return;
      if (next.status !== VoiceConnectionStatus.Disconnected) return;
      void this.recoverDisconnect(conn);
    });
    conn.on("error", (error) => {
      logger.warn({ err: error, guildId: this.guild.id }, "voice connection error");
      if (this.ignoreDisconnect || this.destroyed || this.reconnecting) return;
      void this.reconnectVoice();
    });
  }

  private async recoverDisconnect(conn: VoiceConnection) {
    try {
      await Promise.race([
        entersState(conn, VoiceConnectionStatus.Signalling, 5_000),
        entersState(conn, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      await this.reconnectVoice();
    }
  }

  private async connect() {
    if (this.connection?.state.status === VoiceConnectionStatus.Ready) {
      this.connection.subscribe(this.player);
      return;
    }
    if (this.connection) this.dropConnection();
    this.ignoreDisconnect = false;
    this.connection = joinVoiceChannel({
      channelId: this.voiceChannel.id,
      guildId: this.guild.id,
      adapterCreator: this.guild.voiceAdapterCreator,
      selfDeaf: true,
    });
    this.watchConnection(this.connection);
    this.connection.subscribe(this.player);
    await entersState(this.connection, VoiceConnectionStatus.Ready, 30_000);
  }

  private scheduleLeave() {
    this.cancelLeave();
    this.leaveTimer = setTimeout(() => this.destroy(), 60_000);
  }

  private cancelLeave() {
    if (this.leaveTimer) clearTimeout(this.leaveTimer);
    this.leaveTimer = null;
    if (this.emptyTimer) clearTimeout(this.emptyTimer);
    this.emptyTimer = null;
  }

  private async emitChange() {
    try {
      await this.onChange?.();
    } catch {
      /* ignore */
    }
  }
}

export class MusicManager {
  private readonly sessions = new Map<string, GuildMusic>();

  constructor(private readonly client: KnoxClient) {
    this.client.on("voiceStateUpdate", (oldState, newState) => {
      const session = this.sessions.get(oldState.guild.id) ?? this.sessions.get(newState.guild.id);
      session?.onVoiceState();
    });
  }

  get(guildId: string) {
    return this.sessions.get(guildId) ?? null;
  }

  getOrCreate(guild: Guild, voiceChannel: VoiceBasedChannel, meta: MusicQueueMeta) {
    const existing = this.sessions.get(guild.id);
    if (existing) {
      existing.voiceChannel = voiceChannel;
      existing.meta = { ...existing.meta, ...meta, panelMessageId: existing.meta.panelMessageId ?? meta.panelMessageId };
      return existing;
    }
    const session = new GuildMusic(this.client, guild, voiceChannel, meta);
    session.onChange = async () => {
      const panel = await import("./music-panel.js");
      if (!session.current) await panel.disableMusicPanel(session);
      else await panel.upsertMusicPanel(session);
    };
    this.sessions.set(guild.id, session);
    return session;
  }

  drop(guildId: string) {
    this.sessions.delete(guildId);
  }
}

export async function attachPlayer(client: KnoxClient) {
  if (ffmpegPath) process.env.FFMPEG_PATH = ffmpegPath;
  try {
    require("libsodium-wrappers");
  } catch {
    /* optional encryption backend */
  }
  logger.info({ ffmpeg: ffmpegPath, voice: generateDependencyReport() }, "music player ready (Beatra yt-dlp cache + ffmpeg)");
  client.music = new MusicManager(client);
  void refreshYtDlp();
  // every minute: mirror each server's 24/7 setting and make sure the bot is sitting where it should
  const tick = () => void keepAlwaysVoice(client);
  tick();
  setInterval(tick, 60_000);
}

let alwaysTick: Promise<void> | null = null;

export function keepAlwaysVoice(client: KnoxClient) {
  if (alwaysTick) return alwaysTick;
  alwaysTick = runAlwaysVoice(client).finally(() => {
    alwaysTick = null;
  });
  return alwaysTick;
}

async function runAlwaysVoice(client: KnoxClient) {
  if (!client.music) return;
  await refreshAlwaysVoice(client);
  for (const guildId of alwaysVoiceGuilds()) {
    if (alwaysVoiceHeld(guildId)) continue;
    const channelId = alwaysVoiceChannel(guildId);
    if (!channelId || !isAlwaysVoice(guildId, channelId)) continue;
    const guild = client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(channelId);
    if (!guild || !channel?.isVoiceBased()) continue;
    if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) continue;
    const session = client.music.get(guildId);
    if (!session?.current && !session?.queue.length) continue;
    session.voiceChannel = channel;
    if (guild.members.me?.voice.channelId !== channelId) {
      const ok = await session.join();
      if (!ok) continue;
    }
    if (!session.meta.panelMessageId) {
      const panel = await import("./music-panel.js");
      await panel.upsertMusicPanel(session, true);
    }
  }
}
