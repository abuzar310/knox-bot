import { describe, expect, it } from "vitest";
import {
  MAX_QUARANTINE_MS,
  mergeKept,
  quarantineNotice,
  quarantineUntil,
  quarantinedRoleSet,
  quarantinesDue,
  roleChangeRefusal,
  rolesToRestore,
  rolesToStrip,
  stillVisible,
} from "./quarantine-kit.js";

const ids = { everyoneId: "1", quarantineRoleId: "9" };
const roles = [
  { id: "1", managed: false },
  { id: "2", managed: false },
  { id: "3", managed: true },
  { id: "4", managed: false },
  { id: "9", managed: false },
];
const now = 1_800_000_000_000;

describe("roles in and out of quarantine", () => {
  it("takes every role but @everyone, the quarantine role and the ones Discord manages", () => {
    expect(rolesToStrip(roles, ids)).toEqual(["2", "4"]);
  });

  it("leaves the member with the managed roles and the quarantine role", () => {
    expect(quarantinedRoleSet(roles, ids)).toEqual(["3", "9"]);
  });

  it("adds to the remembered roles on a second quarantine, never forgets", () => {
    expect(mergeKept(["2", "4"], ["4", "5"])).toEqual(["2", "4", "5"]);
    expect(mergeKept(["2"], [])).toEqual(["2"]);
  });

  it("gives back what still exists and names what it cannot", () => {
    const state = (id: string) => (id === "2" ? "ok" : id === "4" ? "gone" : "blocked");
    expect(rolesToRestore(["2", "4", "5", "2"], state)).toEqual({ give: ["2"], lost: ["4", "5"] });
  });
});

describe("length", () => {
  it("has no end without a length, and at most four weeks with one", () => {
    expect(quarantineUntil(null, now)).toBeNull();
    expect(quarantineUntil(3_600_000, now)?.getTime()).toBe(now + 3_600_000);
    expect(quarantineUntil(90 * 86_400_000, now)?.getTime()).toBe(now + MAX_QUARANTINE_MS);
  });

  it("finds the timed quarantines whose time is up", () => {
    const rows = [
      { id: 1, until: null },
      { id: 2, until: new Date(now - 1) },
      { id: 3, until: new Date(now + 60_000) },
      { id: 4, until: new Date(now) },
    ];
    expect(quarantinesDue(rows, now).map((row) => row.id)).toEqual([2, 4]);
  });
});

describe("stillVisible", () => {
  it("names the channels a personal allow or a kept role's allow still opens", () => {
    const channels = [
      { id: "general", viewAllowedFor: [] },
      { id: "ticket", viewAllowedFor: ["member"] },
      { id: "boosters", viewAllowedFor: ["3"] },
      { id: "staff", viewAllowedFor: ["2"] },
      { id: "appeal", viewAllowedFor: ["9", "member"] },
    ];
    expect(stillVisible(channels, "member", ["3", "9"], "appeal")).toEqual(["ticket", "boosters"]);
  });
});

describe("roleChangeRefusal", () => {
  const base = { inside: false, quarantineRoleId: "9", memberQuarantined: false };

  it("lets the quarantine code do anything", () => {
    expect(roleChangeRefusal({ ...base, inside: true, kind: "set", roleIds: ["9"], memberQuarantined: true })).toBeNull();
  });

  it("keeps the quarantine role to /quarantine, both ways", () => {
    expect(roleChangeRefusal({ ...base, kind: "add", roleIds: ["2", "9"] })).toMatch(/only with \/quarantine add/);
    expect(roleChangeRefusal({ ...base, kind: "set", roleIds: ["2", "9"] })).toMatch(/only with \/quarantine add/);
    expect(roleChangeRefusal({ ...base, kind: "remove", roleIds: ["9"] })).toMatch(/only with \/quarantine release/);
  });

  it("gives a quarantined member no other role, but lets roles be taken", () => {
    expect(roleChangeRefusal({ ...base, kind: "add", roleIds: ["2"], memberQuarantined: true })).toMatch(/is quarantined/);
    expect(roleChangeRefusal({ ...base, kind: "set", roleIds: ["2"], memberQuarantined: true })).toMatch(/is quarantined/);
    expect(roleChangeRefusal({ ...base, kind: "remove", roleIds: ["2"], memberQuarantined: true })).toBeNull();
  });

  it("stays out of the way everywhere else, and in servers without quarantine", () => {
    expect(roleChangeRefusal({ ...base, kind: "add", roleIds: ["2"] })).toBeNull();
    expect(roleChangeRefusal({ ...base, quarantineRoleId: null, kind: "add", roleIds: ["9"] })).toBeNull();
  });
});

describe("quarantineNotice", () => {
  it("tells the member why, the case, the end and where they can write", () => {
    const text = quarantineNotice({ server: "Home", reason: "spam", caseNumber: 7, until: new Date(now), appealChannelId: "55" });
    expect(text).toContain("case #7");
    expect(text).toContain("Reason: spam");
    expect(text).toContain(`<t:${now / 1000}:f>`);
    expect(text).toContain("<#55>");
  });

  it("says nothing of an end or a channel when there is none", () => {
    const text = quarantineNotice({ server: "Home", reason: "", caseNumber: 1, until: null, appealChannelId: null });
    expect(text).not.toContain("until");
    expect(text).toContain("No reason provided");
    expect(text).not.toContain("<#");
  });
});
