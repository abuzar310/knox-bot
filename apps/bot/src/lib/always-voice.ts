// 24/7 voice, per server. A guild's `features.alwaysVoiceChannelId` (set with /stay) names the voice channel ZARU
// should sit in around the clock. The map below mirrors those settings so the player can check them without
// awaiting the database; the music tick refreshes it every minute and /stay updates it at once. A guild is "held"
// after someone stops the music on purpose, until the next play.
import type { KnoxClient } from "../client.js";

const wanted = new Map<string, string>(); // guild id -> voice channel id
const held = new Set<string>();

export function setAlwaysVoice(guildId: string, channelId: string | null) {
  if (channelId) wanted.set(guildId, channelId);
  else wanted.delete(guildId);
}

export function alwaysVoiceChannel(guildId: string): string | null {
  return wanted.get(guildId) ?? null;
}

export function alwaysVoiceGuilds(): string[] {
  return [...wanted.keys()];
}

/** is this guild (and, if given, this channel) the configured 24/7 spot? */
export function isAlwaysVoice(guildId: string, channelId?: string | null) {
  const want = wanted.get(guildId);
  if (!want) return false;
  return !channelId || channelId === want;
}

export function holdAlwaysVoice(guildId: string) {
  held.add(guildId);
}

export function releaseAlwaysVoice(guildId: string) {
  held.delete(guildId);
}

export function alwaysVoiceHeld(guildId: string) {
  return held.has(guildId);
}

/** mirror every guild's setting into the map (skips guilds whose settings are still loading) */
export async function refreshAlwaysVoice(client: KnoxClient) {
  for (const guild of client.guilds.cache.values()) {
    const cached = await client.guildConfig.get(guild.id);
    if (cached.degraded) continue;
    setAlwaysVoice(guild.id, cached.settings.features.alwaysVoiceChannelId ?? null);
  }
}
