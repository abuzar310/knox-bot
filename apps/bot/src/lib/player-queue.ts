import type { KnoxClient } from "../client.js";
import type { GuildMusic, MusicQueueMeta } from "./music-session.js";

export type { MusicQueueMeta };

export function guildQueue(client: KnoxClient, guildId: string): GuildMusic | null {
  return client.music?.get(guildId) ?? null;
}
