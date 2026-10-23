import { describe, expect, it } from "vitest";
import { matchHighlights, normalizeWord } from "./highlights.js";

const words = new Map<string, Set<string>>([
  ["valorant", new Set(["u1", "u2"])],
  ["free game", new Set(["u3"])],
  ["art", new Set(["u4"])],
]);

describe("matchHighlights", () => {
  it("matches whole words and phrases, ignoring case", () => {
    const hits = matchHighlights("Anyone up for VALORANT tonight? There is a free game on Epic.", words);
    expect(hits.get("u1")).toEqual(["valorant"]);
    expect(hits.get("u2")).toEqual(["valorant"]);
    expect(hits.get("u3")).toEqual(["free game"]);
  });
  it("does not fire inside other words", () => {
    const hits = matchHighlights("the party started late", words);
    expect(hits.has("u4")).toBe(false);
    expect(matchHighlights("great art!", words).get("u4")).toEqual(["art"]);
  });
  it("normalises words the same way", () => {
    expect(normalizeWord("  Free   Game ")).toBe("free game");
  });
});
