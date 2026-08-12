import type { GuildQueue } from "discord-player";
import type { KnoxClient } from "../client.js";

export type MusicQueueMeta = {
  textChannelId: string;
  color?: string;
  panelMessageId?: string;
};

export function guildQueue(client: KnoxClient, guildId: string): GuildQueue<MusicQueueMeta> | null {
  if (!client.player) return null;
  return (client.player.nodes.get(guildId) as GuildQueue<MusicQueueMeta> | undefined) ?? null;
}
