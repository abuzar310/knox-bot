export const DEFAULT_ALWAYS_GUILD = "931523260418502686";
export const DEFAULT_ALWAYS_VOICE = "1088387938020237322";

export function alwaysVoiceIds() {
  return {
    guildId: process.env.ZARU_24_7_GUILD ?? DEFAULT_ALWAYS_GUILD,
    channelId: process.env.ZARU_24_7_VOICE ?? DEFAULT_ALWAYS_VOICE,
  };
}

let held = false;

export function holdAlwaysVoice() {
  held = true;
}

export function releaseAlwaysVoice() {
  held = false;
}

export function alwaysVoiceHeld() {
  return held;
}

export function isAlwaysVoice(guildId: string, channelId?: string | null) {
  if (process.env.ZARU_24_7 === "0") return false;
  const ids = alwaysVoiceIds();
  if (guildId !== ids.guildId) return false;
  if (channelId && channelId !== ids.channelId) return false;
  return true;
}
