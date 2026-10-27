import { describe, expect, it } from "vitest";
import { pickWinner, nextDraw } from "./lottery.js";

describe("lottery", () => {
  it("picks a winner proportional to tickets", () => {
    const entries = [
      { userId: "a", tickets: 1 },
      { userId: "b", tickets: 9 },
    ];
    expect(pickWinner(entries, 0)).toBe("a"); // first slice
    expect(pickWinner(entries, 0.05)).toBe("a"); // still within a's single ticket (0–0.1)
    expect(pickWinner(entries, 0.5)).toBe("b");
    expect(pickWinner(entries, 0.999)).toBe("b");
  });

  it("returns null when nobody has tickets", () => {
    expect(pickWinner([], 0.5)).toBeNull();
    expect(pickWinner([{ userId: "a", tickets: 0 }], 0.5)).toBeNull();
  });

  it("schedules the next draw by the interval", () => {
    const from = new Date("2026-10-27T00:00:00Z");
    expect(nextDraw(24, from).toISOString()).toBe("2026-10-28T00:00:00.000Z");
    expect(nextDraw(1, from).toISOString()).toBe("2026-10-27T01:00:00.000Z");
  });
});
