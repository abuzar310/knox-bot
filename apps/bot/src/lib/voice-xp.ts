// Voice presence, every job tick: members talking together (two or more humans in the channel, not deafened, not in
// the AFK channel) bank the tick's seconds; each full minute counts towards the server's voice time and, when voice
// XP is on, becomes XP in one UPDATE.
import type { KnoxClient } from "../client.js";
import { addVoiceMinute } from "./xp.js";
import { applyLevelUp } from "./level-up.js";
import { bumpVoiceMinute } from "./stats.js";
import { logger } from "../logger.js";

export async function tickVoiceXp(client: KnoxClient, tickSeconds: number) {
  const active = new Set<string>();
  for (const guild of client.guilds.cache.values()) {
    const cached = await client.guildConfig.get(guild.id);
    const features = cached.settings.features;
    const xpOn = cached.settings.moduleFlags.levels && features.levelsEnabled && features.voiceXpEnabled && features.voiceXpPerMinute > 0;
    const humans = new Map<string, number>();
    for (const state of guild.voiceStates.cache.values()) {
      if (!state.channelId || !state.member || state.member.user.bot) continue;
      humans.set(state.channelId, (humans.get(state.channelId) ?? 0) + 1);
    }
    for (const state of guild.voiceStates.cache.values()) {
      const member = state.member;
      if (!state.channelId || !member || member.user.bot) continue;
      if (state.channelId === guild.afkChannelId || state.deaf || state.selfDeaf) continue;
      if ((humans.get(state.channelId) ?? 0) < 2) continue;
      const key = `${guild.id}:${member.id}`;
      active.add(key);
      const banked = (client.voiceAccum.get(key) ?? 0) + tickSeconds;
      if (banked < 60) {
        client.voiceAccum.set(key, banked);
        continue;
      }
      client.voiceAccum.set(key, banked - 60);
      bumpVoiceMinute(client, guild.id);
      if (!xpOn) continue;
      const result = await addVoiceMinute(client.db, guild.id, member.id, features.voiceXpPerMinute).catch((err) => {
        logger.debug({ err, guildId: guild.id }, "voice xp update failed");
        return null;
      });
      if (result?.leveled) {
        await applyLevelUp(client, guild, member, result.level, cached.settings.embedColor, features.levelUpChannelId, null, "voice");
      }
    }
  }
  // whoever left voice loses their partial minute
  for (const key of [...client.voiceAccum.keys()]) if (!active.has(key)) client.voiceAccum.delete(key);
}

export function formatVoiceTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${minutes} min`;
}
