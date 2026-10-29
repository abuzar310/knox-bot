import { describe, expect, it } from "vitest";
import { duePurges } from "./scheduled-purge.js";

describe("duePurges", () => {
  const hour = 3_600_000;
  it("waits out the interval after the last run", () => {
    const now = Date.parse("2026-10-29T12:00:00Z");
    expect(duePurges([{ channelId: "1", everyHours: 6, lastRunAt: "2026-10-29T08:00:00Z" }], now)).toEqual([]);
    expect(duePurges([{ channelId: "1", everyHours: 6, lastRunAt: "2026-10-29T05:00:00Z" }], now)).toEqual(["1"]);
  });

  it("runs immediately when a schedule has never run", () => {
    expect(duePurges([{ channelId: "9", everyHours: 24, lastRunAt: null }], Date.now())).toEqual(["9"]);
    expect(hour).toBeGreaterThan(0);
  });
});
