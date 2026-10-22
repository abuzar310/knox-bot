import { describe, expect, it } from "vitest";
import { isBumpDone, threadNameFor } from "./engagement.js";

describe("threadNameFor", () => {
  it("uses the first non-empty line without links or mentions", () => {
    expect(threadNameFor("\n\n  Patch notes 1.2 <@123> https://example.com/x  \nmore", "fallback")).toBe("Patch notes 1.2");
  });
  it("cuts long titles and falls back when nothing is left", () => {
    expect(threadNameFor("a".repeat(120), "fallback")).toBe(`${"a".repeat(77)}…`);
    expect(threadNameFor("https://example.com <#1>", "Zaru's post")).toBe("Zaru's post");
  });
});

describe("isBumpDone", () => {
  it("recognises DISBOARD's confirmation and nothing else", () => {
    expect(isBumpDone(":thumbsup: Bump done! Check it out on DISBOARD.")).toBe(true);
    expect(isBumpDone("Please wait another 1 hour 12 minutes until the server can be bumped")).toBe(false);
    expect(isBumpDone(null)).toBe(false);
  });
});
