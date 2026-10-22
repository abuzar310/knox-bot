import { beforeEach, describe, expect, it } from "vitest";
import {
  alwaysVoiceChannel,
  alwaysVoiceGuilds,
  alwaysVoiceHeld,
  holdAlwaysVoice,
  isAlwaysVoice,
  releaseAlwaysVoice,
  setAlwaysVoice,
} from "./always-voice.js";

beforeEach(() => {
  for (const id of alwaysVoiceGuilds()) setAlwaysVoice(id, null);
  releaseAlwaysVoice("g1");
});

describe("always voice, per guild", () => {
  it("knows only the guilds that configured a channel", () => {
    expect(isAlwaysVoice("g1")).toBe(false);
    setAlwaysVoice("g1", "v1");
    expect(isAlwaysVoice("g1")).toBe(true);
    expect(isAlwaysVoice("g1", "v1")).toBe(true);
    expect(isAlwaysVoice("g1", "v2")).toBe(false);
    expect(isAlwaysVoice("g2")).toBe(false);
    expect(alwaysVoiceChannel("g1")).toBe("v1");
    expect(alwaysVoiceGuilds()).toEqual(["g1"]);
  });

  it("forgets a guild when the channel is cleared", () => {
    setAlwaysVoice("g1", "v1");
    setAlwaysVoice("g1", null);
    expect(isAlwaysVoice("g1")).toBe(false);
    expect(alwaysVoiceGuilds()).toEqual([]);
  });

  it("holds after a stop and releases on play, independently per guild", () => {
    holdAlwaysVoice("g1");
    expect(alwaysVoiceHeld("g1")).toBe(true);
    expect(alwaysVoiceHeld("g2")).toBe(false);
    releaseAlwaysVoice("g1");
    expect(alwaysVoiceHeld("g1")).toBe(false);
  });
});
