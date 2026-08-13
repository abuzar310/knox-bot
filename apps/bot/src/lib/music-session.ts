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
import type { Guild, VoiceBasedChannel } from "discord.js";
import type { KnoxClient } from "../client.js";
import { logger } from "../logger.js";
import {
  cachePathFor,
  deleteCachedFile,
  downloadTrackAudio,
  isSoundCloudURL,
  isYouTubeURL,
  youtubeSearch,
  youtubeStreamUrl,
  type KnoxTrack,
} from "./youtube.js";
import { refreshYtDlp } from "./yt-stream.js";

const require = createRequire(import.meta.url);
const ffmpegPath = require("ffmpeg-static") as string | null;
const prism = require("prism-media") as {
  FFmpeg: new (opts: { command?: string; args: string[] }) => Readable & NodeJS.WritableStream;
};

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
  }

  get paused() {
    return this.player.state.status === AudioPlayerStatus.Paused || this.player.state.status === AudioPlayerStatus.AutoPaused;
  }

  playbackMs() {
    if (!this.startedAt) return 0;
    const extra = this.pauseStarted ? Date.now() - this.pauseStarted : 0;
    return Date.now() - this.startedAt - this.pausedMs - extra;
  }

  async addAndPlay(tracks: KnoxTrack[]) {
    if (!tracks.length) throw new Error("No tracks found");
    this.cancelLeave();
    const alreadyPlaying = Boolean(this.current);
    this.queue.push(...tracks);
    if (!alreadyPlaying) {
      await this.playNext();
      if (!this.current) throw new Error("Could not play that track");
    } else {
      void this.preload(this.queue[0]);
      await this.emitChange();
    }
    return { alreadyPlaying, preview: tracks[0] };
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
    this.stopRequested = true;
    this.queue = [];
    this.current = null;
    this.player.stop(true);
    this.destroy();
  }

  destroy() {
    if (this.destroyed) return;
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
    const channel = this.guild.members.me?.voice.channel ?? this.voiceChannel;
    const humans = channel.members.filter((member) => !member.user.bot).size;
    if (humans === 0) {
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
    const next = this.queue.shift();
    if (!next) {
      this.current = null;
      this.transitioning = false;
      this.scheduleLeave();
      await this.emitChange();
      return;
    }
    this.current = next;
    await this.playCurrent();
  }

  private async playCurrent() {
    const track = this.current;
    if (!track) return;
    this.stopRequested = false;
    this.skipRequested = false;
    this.transitioning = true;
    this.startedAt = null;
    this.pausedMs = 0;
    this.pauseStarted = null;
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
        logger.warn({ err: error, url: playUrl }, "yt-dlp download failed, trying stream");
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
        this.resource = this.resourceFromFile(file);
      } else {
        this.resource = await this.resourceFromStream(playUrl);
      }
      this.resource.volume?.setVolume(this.volume / 100);
      this.player.play(this.resource);
      await entersState(this.player, AudioPlayerStatus.Playing, 20_000);
      this.transitioning = false;
      logger.info({ title: track.title }, "now playing");
      await this.emitChange();
      void this.preload(this.queue[0]);
    } catch (error) {
      this.transitioning = false;
      logger.warn({ err: error, title: track.title }, "track play failed");
      this.current = null;
      await this.playNext();
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

  private resourceFromFile(file: string) {
    if (!fs.existsSync(file) || fs.statSync(file).size < 1000) {
      throw new Error("Cached audio file is missing");
    }
    return createAudioResource(file, {
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

  private async preload(track?: KnoxTrack) {
    if (!track) return;
    try {
      const url = await this.resolvePlayUrl(track);
      if (fs.existsSync(cachePathFor(url))) return;
      await downloadTrackAudio(url, isYouTubeURL(url));
    } catch (error) {
      logger.warn({ err: error, title: track.title }, "preload failed");
    }
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

  private async connect() {
    if (this.connection?.state.status === VoiceConnectionStatus.Ready) return;
    if (this.connection) {
      try {
        this.connection.destroy();
      } catch {
        /* ignore */
      }
      this.connection = null;
    }
    this.connection = joinVoiceChannel({
      channelId: this.voiceChannel.id,
      guildId: this.guild.id,
      adapterCreator: this.guild.voiceAdapterCreator,
      selfDeaf: true,
    });
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
  logger.info({ ffmpeg: ffmpegPath, voice: generateDependencyReport() }, "music player ready (Beatra yt-dlp cache + ffmpeg)");
  client.music = new MusicManager(client);
  void refreshYtDlp();
}
