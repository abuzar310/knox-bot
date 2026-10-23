import { describe, expect, it } from "vitest";
import { dayKey, dayKeyAgo, formatHours } from "./stats.js";

describe("stats helpers", () => {
  it("keys days in UTC and counts back", () => {
    const at = new Date("2026-10-23T01:30:00Z");
    expect(dayKey(at)).toBe("2026-10-23");
    expect(dayKeyAgo(1, at)).toBe("2026-10-22");
    expect(dayKeyAgo(6, at)).toBe("2026-10-17");
  });
  it("formats voice time for people", () => {
    expect(formatHours(45)).toBe("45 min");
    expect(formatHours(150)).toBe("2.5 h");
    expect(formatHours(615)).toBe("10 h");
  });
});
