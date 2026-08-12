import type { GuildQueue } from "discord-player";
import type { KnoxClient } from "../client.js";

export type MusicQueueMeta = {
  textChannelId: string;
  color?: string;
};

export function guildQueue(client: KnoxClient, guildId: string): GuildQueue<MusicQueueMeta> | null {
  return (client.player.nodes.get(guildId) as GuildQueue<MusicQueueMeta> | undefined) ?? null;
}
