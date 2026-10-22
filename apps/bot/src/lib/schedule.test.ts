import { describe, expect, it } from "vitest";
import { describeRule, nextRun, parseTimeUtc } from "./schedule.js";

// Thursday 2026-10-22 10:30:00 UTC
const after = new Date(Date.UTC(2026, 9, 22, 10, 30));

describe("nextRun", () => {
  it("aligns interval repeats to the anchor time", () => {
    expect(nextRun({ repeat: "hourly", atUtc: null, weekday: null }, after).toISOString()).toBe("2026-10-22T11:00:00.000Z");
    expect(nextRun({ repeat: "6h", atUtc: null, weekday: null }, after).toISOString()).toBe("2026-10-22T12:00:00.000Z");
    expect(nextRun({ repeat: "6h", atUtc: "09:15", weekday: null }, after).toISOString()).toBe("2026-10-22T15:15:00.000Z");
    expect(nextRun({ repeat: "12h", atUtc: "11:00", weekday: null }, after).toISOString()).toBe("2026-10-22T11:00:00.000Z");
  });

  it("runs daily at the given UTC time, today if still ahead, else tomorrow", () => {
    expect(nextRun({ repeat: "daily", atUtc: "18:00", weekday: null }, after).toISOString()).toBe("2026-10-22T18:00:00.000Z");
    expect(nextRun({ repeat: "daily", atUtc: "09:00", weekday: null }, after).toISOString()).toBe("2026-10-23T09:00:00.000Z");
    expect(nextRun({ repeat: "daily", atUtc: null, weekday: null }, after).toISOString()).toBe("2026-10-23T09:00:00.000Z");
  });

  it("runs weekly on the chosen weekday", () => {
    // next Monday (1) after Thursday 22 Oct is 26 Oct
    expect(nextRun({ repeat: "weekly", atUtc: "12:00", weekday: 1 }, after).toISOString()).toBe("2026-10-26T12:00:00.000Z");
    // same weekday, time already passed today → a week later
    expect(nextRun({ repeat: "weekly", atUtc: "08:00", weekday: 4 }, after).toISOString()).toBe("2026-10-29T08:00:00.000Z");
    // same weekday, time still ahead today → today
    expect(nextRun({ repeat: "weekly", atUtc: "20:00", weekday: 4 }, after).toISOString()).toBe("2026-10-22T20:00:00.000Z");
  });

  it("parses times and describes rules", () => {
    expect(parseTimeUtc("7:05")).toEqual({ h: 7, m: 5 });
    expect(parseTimeUtc("24:00")).toBeNull();
    expect(parseTimeUtc("noon")).toBeNull();
    expect(describeRule({ repeat: "weekly", atUtc: "12:00", weekday: 1 })).toBe("every Monday at 12:00 UTC");
    expect(describeRule({ repeat: "6h", atUtc: null, weekday: null })).toBe("every 6 hours");
  });
});
