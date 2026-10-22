import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_ALWAYS_GUILD,
  DEFAULT_ALWAYS_VOICE,
  alwaysVoiceHeld,
  holdAlwaysVoice,
  isAlwaysVoice,
  releaseAlwaysVoice,
} from "./always-voice.js";

const keys = ["ZARU_24_7", "ZARU_24_7_GUILD", "ZARU_24_7_VOICE"] as const;

afterEach(() => {
  for (const key of keys) delete process.env[key];
});

describe("isAlwaysVoice", () => {
  it("stays on SQUAD by default", () => {
    expect(isAlwaysVoice(DEFAULT_ALWAYS_GUILD)).toBe(true);
    expect(isAlwaysVoice(DEFAULT_ALWAYS_GUILD, DEFAULT_ALWAYS_VOICE)).toBe(true);
    expect(isAlwaysVoice(DEFAULT_ALWAYS_GUILD, "0")).toBe(false);
    expect(isAlwaysVoice("0")).toBe(false);
  });

  it("turns off with ZARU_24_7=0", () => {
    process.env.ZARU_24_7 = "0";
    expect(isAlwaysVoice(DEFAULT_ALWAYS_GUILD, DEFAULT_ALWAYS_VOICE)).toBe(false);
  });
});

describe("always voice hold", () => {
  it("holds after stop and releases on play", () => {
    releaseAlwaysVoice();
    holdAlwaysVoice();
    expect(alwaysVoiceHeld()).toBe(true);
    releaseAlwaysVoice();
    expect(alwaysVoiceHeld()).toBe(false);
  });
});
