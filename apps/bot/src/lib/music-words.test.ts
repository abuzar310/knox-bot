import { describe, expect, it } from "vitest";
import { parseMusicAsk } from "./music-words.js";

describe("parseMusicAsk", () => {
  it("plays a named song and leaves game talk alone", () => {
    expect(parseMusicAsk("play blinding lights")).toEqual({ kind: "play", query: "blinding lights" });
    expect(parseMusicAsk("can you put on lofi hip hop")).toEqual({ kind: "play", query: "lofi hip hop" });
    expect(parseMusicAsk("what can I play")).toBeNull();
    expect(parseMusicAsk("play a game")).toBeNull();
  });

  it("reads the short controls", () => {
    expect(parseMusicAsk("skip")).toEqual({ kind: "skip" });
    expect(parseMusicAsk("volume 40")).toEqual({ kind: "volume", value: 40 });
    expect(parseMusicAsk("filter vaporwave")).toEqual({ kind: "filter", name: "vaporwave" });
    expect(parseMusicAsk("leave voice")).toEqual({ kind: "leave" });
    expect(parseMusicAsk("leave")).toBeNull();
  });
});
