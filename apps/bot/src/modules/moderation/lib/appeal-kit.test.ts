import { describe, expect, it } from "vitest";
import { APPEAL_COOLDOWN_MS, appealPublicOutcome, appealRefusal, bothAnswered, canAppeal, cleanAnswer, memberOutcomeText, reviewText, runDecision } from "./appeal-kit.js";

const now = 1_800_000_000_000;
const base = { quarantined: true, hasOpenAppeal: false, lastRejectedAt: null };

describe("canAppeal", () => {
  it("lets a quarantined member with no open appeal and no recent rejection appeal", () => {
    expect(canAppeal(base, now)).toEqual({ ok: true });
  });

  it("refuses when they aren't quarantined, or already have one open", () => {
    expect(canAppeal({ ...base, quarantined: false }, now)).toEqual({ ok: false, why: "not-quarantined" });
    expect(canAppeal({ ...base, hasOpenAppeal: true }, now)).toEqual({ ok: false, why: "open" });
  });

  it("holds them for a day after a rejection, then lets them back in", () => {
    expect(canAppeal({ ...base, lastRejectedAt: now - APPEAL_COOLDOWN_MS + 1 }, now)).toEqual({ ok: false, why: "cooldown", retryAt: now + 1 });
    expect(canAppeal({ ...base, lastRejectedAt: now - APPEAL_COOLDOWN_MS }, now)).toEqual({ ok: true });
  });

  it("puts 'not quarantined' before the cooldown, so an ended quarantine never reads as a cooldown", () => {
    expect(canAppeal({ quarantined: false, hasOpenAppeal: false, lastRejectedAt: now - 1000 }, now)).toEqual({ ok: false, why: "not-quarantined" });
  });
});

describe("appealRefusal", () => {
  it("names the reason and, for a cooldown, when they may try again", () => {
    expect(appealRefusal({ ok: false, why: "not-quarantined" })).toContain("not quarantined");
    expect(appealRefusal({ ok: false, why: "open" })).toContain("already have an appeal");
    expect(appealRefusal({ ok: false, why: "cooldown", retryAt: now })).toContain(`<t:${now / 1000}:R>`);
  });
});

describe("answers", () => {
  it("trims, caps and checks that both are filled", () => {
    expect(cleanAnswer(`  ${"x".repeat(2000)}  `).length).toBe(1000);
    expect(bothAnswered("  ", "something")).toBe(false);
    expect(bothAnswered("a reason", "another")).toBe(true);
  });
});

describe("reviewText", () => {
  it("carries the member, case, who quarantined them and both answers", () => {
    const text = reviewText({ userId: "7", tag: "newcomer", caseNumber: 12, quarantinedBy: "ZARU (anti-nuke)", whatHappened: "I was wrongly flagged", whyLift: "please check" });
    expect(text).toContain("<@7>");
    expect(text).toContain("case #12");
    expect(text).toContain("ZARU (anti-nuke)");
    expect(text).toContain("I was wrongly flagged");
    expect(text).toContain("please check");
  });
});

describe("memberOutcomeText (the DM, with the note)", () => {
  it("tells an accepted member their roles are back", () => {
    expect(memberOutcomeText("accept", "sorry about that", now)).toContain("accepted");
    expect(memberOutcomeText("accept", "sorry about that", now)).toContain("sorry about that");
  });

  it("gives a rejected member the staff note and the retry time", () => {
    const text = memberOutcomeText("reject", "still under review", now);
    expect(text).toContain("still under review");
    expect(text).toContain(`<t:${Math.ceil(now / 1000)}:R>`);
  });
});

describe("appealPublicOutcome (the #appeal fallback)", () => {
  it("carries only the outcome and the retry time — never the words or the note", () => {
    const reject = appealPublicOutcome("7", "reject", now);
    expect(reject).toContain("<@7>");
    expect(reject).toContain("wasn't accepted");
    expect(reject).toContain(`<t:${Math.ceil(now / 1000)}:R>`);
    expect(appealPublicOutcome("7", "accept", now)).toContain("Welcome back");
  });
});

describe("runDecision", () => {
  const make = (over = {}) => {
    const calls: string[] = [];
    const deps = {
      liveQuarantineId: async () => 10,
      claim: async () => ({ id: 1 }),
      release: async () => void calls.push("release"),
      reopen: async () => void calls.push("reopen"),
      ...over,
    };
    return { deps, calls };
  };

  it("refuses when the live quarantine isn't the one the appeal was about (and never claims)", async () => {
    let claimed = false;
    const { deps } = make({ liveQuarantineId: async () => 99, claim: async () => ((claimed = true), { id: 1 }) });
    expect(await runDecision(deps, { decision: "accept", appealQuarantineId: 10 })).toEqual({ kind: "stale" });
    expect(claimed).toBe(false);
  });

  it("refuses when the member is no longer quarantined", async () => {
    const { deps } = make({ liveQuarantineId: async () => null });
    expect(await runDecision(deps, { decision: "reject", appealQuarantineId: 10 })).toEqual({ kind: "stale" });
  });

  it("the second press loses the claim", async () => {
    const { deps } = make({ claim: async () => null });
    expect(await runDecision(deps, { decision: "accept", appealQuarantineId: 10 })).toEqual({ kind: "already-handled" });
  });

  it("rejects without releasing", async () => {
    const { deps, calls } = make();
    expect(await runDecision(deps, { decision: "reject", appealQuarantineId: 10 })).toMatchObject({ kind: "rejected" });
    expect(calls).toEqual([]);
  });

  it("accepts and releases", async () => {
    const { deps, calls } = make();
    expect(await runDecision(deps, { decision: "accept", appealQuarantineId: 10 })).toMatchObject({ kind: "accepted" });
    expect(calls).toEqual(["release"]);
  });

  it("reopens the appeal when the release throws", async () => {
    const { deps, calls } = make({ release: async () => { throw new Error("roles above me"); } });
    const result = await runDecision(deps, { decision: "accept", appealQuarantineId: 10 });
    expect(result.kind).toBe("release-failed");
    expect(calls).toEqual(["reopen"]);
  });
});
