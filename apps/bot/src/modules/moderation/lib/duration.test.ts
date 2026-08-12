import { describe, expect, it } from "vitest";
import { formatDuration, parseDuration } from "./duration.js";

describe("parseDuration", () => {
  it("parses minutes and hours", () => {
    expect(parseDuration("10m")).toBe(600_000);
    expect(parseDuration("1h")).toBe(3_600_000);
  });

  it("rejects junk", () => {
    expect(parseDuration("forever")).toBeNull();
  });

  it("caps at 28 days", () => {
    expect(parseDuration("40d")).toBe(28 * 86_400_000);
  });
});

describe("formatDuration", () => {
  it("formats mixed units", () => {
    expect(formatDuration(90 * 60_000)).toBe("1h 30m");
  });
});
