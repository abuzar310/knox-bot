import { describe, expect, it } from "vitest";
import { formatUptime } from "./uptime.js";

describe("formatUptime", () => {
  it("uses seconds, minutes, hours, and days", () => {
    expect(formatUptime(0)).toBe("0s");
    expect(formatUptime(45)).toBe("45s");
    expect(formatUptime(90)).toBe("1m");
    expect(formatUptime(3_600 + 300)).toBe("1h 5m");
    expect(formatUptime(86_400 + 3_600 + 120)).toBe("1d 1h 2m");
  });
});
