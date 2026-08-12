import { createRequire } from "node:module";
import { GuildQueueEvent, Player } from "discord-player";
import { AttachmentExtractor, SpotifyExtractor } from "@discord-player/extractor";
import { YoutubeiExtractor } from "discord-player-youtubei";
import type { KnoxClient } from "../client.js";
import { logger } from "../logger.js";
import { knoxEmbed } from "../interactions/embed.js";
import type { MusicQueueMeta } from "./player-queue.js";

const require = createRequire(import.meta.url);
const ffmpegPath = require("ffmpeg-static") as string | null;

export async function attachPlayer(client: KnoxClient) {
  const player = new Player(client as never, {
    skipFFmpeg: false,
    ffmpegPath: ffmpegPath ?? undefined,
  });

  try {
    await player.extractors.register(YoutubeiExtractor, {
      cookie: process.env.YOUTUBE_COOKIE,
      disablePlayer: true,
      streamOptions: { useClient: "ANDROID" },
    });
  } catch (error) {
    logger.error({ err: error }, "YouTube extractor failed");
  }
  try {
    await player.extractors.register(SpotifyExtractor, {
      clientId: process.env.SPOTIFY_CLIENT_ID ?? null,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? null,
    });
  } catch (error) {
    logger.error({ err: error }, "Spotify extractor failed");
  }
  try {
    await player.extractors.register(AttachmentExtractor, {});
  } catch (error) {
    logger.error({ err: error }, "attachment extractor failed");
  }

  player.events.on(GuildQueueEvent.PlayerStart, async (queue, track) => {
    const meta = queue.metadata as MusicQueueMeta | undefined;
    if (!meta?.textChannelId) return;
    const channel = queue.guild.channels.cache.get(meta.textChannelId);
    if (!channel?.isTextBased() || channel.isDMBased()) return;
    await channel
      .send({
        embeds: [
          knoxEmbed(meta.color)
            .setTitle("Now playing")
            .setDescription(`**${track.title}**\n${track.author}`)
            .setThumbnail(track.thumbnail)
            .setFooter({ text: track.duration || "live" }),
        ],
      })
      .catch(() => undefined);
  });

  player.events.on(GuildQueueEvent.PlayerError, async (queue, error) => {
    logger.warn({ err: error }, "music player error");
    const meta = queue.metadata as MusicQueueMeta | undefined;
    if (!meta?.textChannelId) return;
    const channel = queue.guild.channels.cache.get(meta.textChannelId);
    if (!channel?.isTextBased() || channel.isDMBased()) return;
    await channel
      .send({
        content: "YouTube blocked the audio stream. Try another search or a direct YouTube link.",
      })
      .catch(() => undefined);
  });
  player.events.on(GuildQueueEvent.Error, (_queue, error) => {
    logger.warn({ err: error }, "music queue error");
  });

  client.player = player;
  logger.info("music player ready (YouTube + Spotify)");
}
