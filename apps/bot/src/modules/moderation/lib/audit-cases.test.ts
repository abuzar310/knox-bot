import { describe, expect, it } from "vitest";
import { AUDIT_ACTION, NO_REASON, auditCase, auditCaseLabel, evidenceRefusal, type AuditEntryLike } from "./audit-cases.js";

const BOT = "900";
const MOD = "111";
const MEMBER = "222";
const at = 1_800_000_000_000;
const on = { botId: BOT, enabled: true, settingsLoaded: true };

function entry(over: Partial<AuditEntryLike>): AuditEntryLike {
  return { id: "5001", action: AUDIT_ACTION.ban, targetId: MEMBER, executorId: MOD, reason: null, createdTimestamp: at, changes: [], ...over };
}

function timeout(until: number | null, old: number | null = null) {
  return [
    {
      key: "communication_disabled_until",
      old: old === null ? undefined : new Date(old).toISOString(),
      new: until === null ? undefined : new Date(until).toISOString(),
    },
  ];
}

describe("auditCase", () => {
  it("makes a case of a ban, a kick and an unban done by hand", () => {
    expect(auditCase(entry({ reason: "  raid account " }), on)).toEqual({
      type: "ban",
      targetId: MEMBER,
      moderatorId: MOD,
      reason: "raid account",
      durationMs: null,
      active: true,
      auditEntryId: "5001",
    });
    expect(auditCase(entry({ action: AUDIT_ACTION.kick }), on)).toMatchObject({ type: "kick", active: false, reason: NO_REASON });
    expect(auditCase(entry({ action: AUDIT_ACTION.unban }), on)).toMatchObject({ type: "unban", active: false });
  });

  it("reads a timeout's length from the entry's own time, to the second", () => {
    const made = auditCase(entry({ action: AUDIT_ACTION.memberUpdate, changes: timeout(at + 600_000 + 380) }), on);
    expect(made).toMatchObject({ type: "mute", durationMs: 600_000, active: true });
  });

  it("caps a timeout at Discord's 28 days", () => {
    const made = auditCase(entry({ action: AUDIT_ACTION.memberUpdate, changes: timeout(at + 40 * 86_400_000) }), on);
    expect(made).toMatchObject({ type: "mute", durationMs: 28 * 86_400_000 });
  });

  it("takes a cleared timeout, or one moved into the past, as a removal", () => {
    expect(auditCase(entry({ action: AUDIT_ACTION.memberUpdate, changes: timeout(null, at + 600_000) }), on)).toMatchObject({
      type: "unmute",
      durationMs: null,
      active: false,
    });
    expect(auditCase(entry({ action: AUDIT_ACTION.memberUpdate, changes: timeout(at - 5_000, at + 600_000) }), on)).toMatchObject({ type: "unmute" });
  });

  it("makes no case of other member changes or other actions", () => {
    expect(auditCase(entry({ action: AUDIT_ACTION.memberUpdate, changes: [{ key: "nick", old: "a", new: "b" }] }), on)).toBe("not-a-case");
    expect(auditCase(entry({ action: AUDIT_ACTION.memberUpdate, changes: timeout(null) }), on)).toBe("not-a-case");
    expect(auditCase(entry({ action: 10 }), on)).toBe("not-a-case");
  });

  it("leaves ZARU's own actions to the command that made them", () => {
    expect(auditCase(entry({ executorId: BOT }), on)).toBe("own-action");
  });

  it("records another bot's action under that bot", () => {
    expect(auditCase(entry({ executorId: "777" }), on)).toMatchObject({ moderatorId: "777" });
  });

  it("needs a target and a moderator", () => {
    expect(auditCase(entry({ targetId: null }), on)).toBe("no-target");
    expect(auditCase(entry({ executorId: null }), on)).toBe("no-moderator");
  });

  it("does nothing when switched off, or on stand-in settings", () => {
    expect(auditCase(entry({}), { ...on, enabled: false })).toBe("switched-off");
    expect(auditCase(entry({}), { ...on, settingsLoaded: false })).toBe("settings-not-loaded");
  });

  it("keeps a long reason within the case's limit", () => {
    const made = auditCase(entry({ reason: "x".repeat(1500) }), on);
    expect(typeof made === "object" && made.reason.length).toBe(1000);
  });
});

describe("auditCaseLabel", () => {
  it("names each action as the mod-log shows it", () => {
    expect(auditCaseLabel("mute")).toEqual({ title: "Member timed out (by hand)", action: "Timeout" });
    expect(auditCaseLabel("unban").title).toBe("Member unbanned (by hand)");
    expect(auditCaseLabel("warn").action).toBe("warn");
  });
});

describe("evidenceRefusal", () => {
  it("lets the moderator who acted, or a server manager, add evidence", () => {
    expect(evidenceRefusal({ moderatorId: MOD }, { userId: MOD, managesServer: false, botId: BOT })).toBeNull();
    expect(evidenceRefusal({ moderatorId: MOD }, { userId: "333", managesServer: true, botId: BOT })).toBeNull();
    expect(evidenceRefusal({ moderatorId: BOT }, { userId: "333", managesServer: true, botId: BOT })).toBeNull();
  });

  it("refuses another moderator, and anyone but a manager on ZARU's own cases", () => {
    expect(evidenceRefusal({ moderatorId: MOD }, { userId: "333", managesServer: false, botId: BOT })).toMatch(/Only the moderator who acted/);
    expect(evidenceRefusal({ moderatorId: BOT }, { userId: MOD, managesServer: false, botId: BOT })).toMatch(/ZARU acted/);
  });
});
