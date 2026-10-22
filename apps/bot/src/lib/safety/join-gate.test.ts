import { describe, expect, it } from "vitest";
import { formatAge, joinGateMessage, joinVerdict } from "./join-gate.js";

const HOUR = 3_600_000;
const now = 1_800_000_000_000;
const off = { raidMode: false, joinGateMinAccountAgeHours: 0, joinGateRequireAvatar: false, raidJoinsPerMinute: 0 };

describe("joinVerdict", () => {
  it("lets everyone in when nothing is configured", () => {
    expect(joinVerdict(off, { createdTimestamp: now - HOUR, hasAvatar: false, joinsLastMinute: 50, now })).toBeNull();
  });

  it("turns away accounts younger than the minimum age", () => {
    const mod = { ...off, joinGateMinAccountAgeHours: 24 };
    expect(joinVerdict(mod, { createdTimestamp: now - 2 * HOUR, hasAvatar: true, joinsLastMinute: 1, now })).toMatchObject({ reason: "age" });
    expect(joinVerdict(mod, { createdTimestamp: now - 25 * HOUR, hasAvatar: true, joinsLastMinute: 1, now })).toBeNull();
  });

  it("turns away members without an avatar when asked", () => {
    const mod = { ...off, joinGateRequireAvatar: true };
    expect(joinVerdict(mod, { createdTimestamp: now - 999 * HOUR, hasAvatar: false, joinsLastMinute: 1, now })).toMatchObject({ reason: "avatar" });
    expect(joinVerdict(mod, { createdTimestamp: now - 999 * HOUR, hasAvatar: true, joinsLastMinute: 1, now })).toBeNull();
  });

  it("calls a burst of joins a lockdown, and raid mode too", () => {
    expect(joinVerdict({ ...off, raidJoinsPerMinute: 10 }, { createdTimestamp: 0, hasAvatar: true, joinsLastMinute: 10, now })).toMatchObject({ reason: "lockdown" });
    expect(joinVerdict({ ...off, raidJoinsPerMinute: 10 }, { createdTimestamp: 0, hasAvatar: true, joinsLastMinute: 9, now })).toBeNull();
    expect(joinVerdict({ ...off, raidMode: true }, { createdTimestamp: 0, hasAvatar: true, joinsLastMinute: 1, now })).toMatchObject({ reason: "lockdown" });
  });

  it("words the DM for each reason and formats ages readably", () => {
    expect(joinGateMessage("ZARU HQ", { reason: "age", detail: "" }, 24)).toContain("older than 24 hours");
    expect(joinGateMessage("ZARU HQ", { reason: "lockdown", detail: "" }, 0)).toContain("lockdown");
    expect(formatAge(30 * 60_000)).toBe("30 min");
    expect(formatAge(5 * HOUR)).toBe("5 h");
    expect(formatAge(72 * HOUR)).toBe("3 days");
  });
});
