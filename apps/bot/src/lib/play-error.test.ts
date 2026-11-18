import { describe, expect, it } from "vitest";
import { lowDelayInputArgs, opusPassthrough, playErrorMessage, toggleFilter } from "./music-session.js";

describe("playErrorMessage", () => {
  it("never leaks yt-dlp command lines", () => {
    const raw =
      "Command failed: D:\\zaru verce\\knox-bot\\knox-bot\\apps\\bot\\bin\\yt-dlp.exe scsearch5:vardhann";
    expect(playErrorMessage(new Error(raw))).toBe(
      "Could not play that. Try a YouTube link or another name.",
    );
    expect(playErrorMessage(new Error(raw))).not.toMatch(/yt-dlp|scsearch|D:\\/);
  });

  it("turns the lit effect off when that button is pressed again", () => {
    expect(toggleFilter("vaporwave", "vaporwave")).toBe("off");
    expect(toggleFilter("off", "vaporwave")).toBe("vaporwave");
    expect(toggleFilter("bassboost", "nightcore")).toBe("nightcore");
  });

  it("sends a plain Opus file straight through", () => {
    expect(opusPassthrough("track.webm", { filter: null, volume: 100, seekMs: 0 })).toBe("webm");
    expect(opusPassthrough("track.opus", { filter: null, volume: 100, seekMs: 0 })).toBe("ogg");
    expect(opusPassthrough("track.m4a", { filter: null, volume: 100, seekMs: 0 })).toBeNull();
    expect(opusPassthrough("track.webm", { filter: "bass=g=12", volume: 100, seekMs: 0 })).toBeNull();
    expect(opusPassthrough("track.webm", { filter: null, volume: 40, seekMs: 0 })).toBeNull();
  });

  it("flushes ffmpeg instead of waiting on a large probe", () => {
    expect(lowDelayInputArgs()).toContain("+nobuffer+flush_packets");
    expect(lowDelayInputArgs(1500)).toContain("1.500");
  });

  it("maps missing YouTube formats", () => {
    expect(playErrorMessage(new Error("Requested format is not available"))).toBe(
      "YouTube had no audio for that link. Try the name again.",
    );
  });
});
