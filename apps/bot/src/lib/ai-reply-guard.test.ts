import { describe, expect, it } from "vitest";
import { REPLY_MAX, budgetNotice, capAtSentence, checkReply, makeAiBudget } from "./ai-reply-guard.js";

const clean = { hasScamLink: () => false };
const HOUR = 3_600_000;
const now = 1_800_000_000_000;

describe("checkReply", () => {
  it("passes an ordinary answer untouched", () => {
    expect(checkReply("  Sure, the server has 34 members.  ", clean)).toEqual({ ok: true, text: "Sure, the server has 34 members.", changed: [] });
  });

  it("blocks an empty answer and one with a scam link", () => {
    expect(checkReply("   ", clean)).toEqual({ ok: false, reason: "empty" });
    expect(checkReply("free nitro at dlscord-gift.example", { hasScamLink: () => true })).toEqual({ ok: false, reason: "scam link" });
  });

  it("takes invite links out, whatever their spelling", () => {
    const made = checkReply("Join https://discord.gg/abc123 or discord.com/invite/xyz-9 or discordapp.com/invite/q", clean);
    expect(made).toMatchObject({ ok: true, changed: ["invite link"] });
    expect(made.ok && made.text).toBe("Join [invite link removed] or [invite link removed] or [invite link removed]");
  });

  it("defuses mass mentions and role mentions but keeps a reply to a person", () => {
    const made = checkReply("hey @everyone and @here, ask <@&123456789012345678> or <@123456789012345678>", clean);
    expect(made.ok && made.text).toBe("hey @​everyone and @​here, ask @role or <@123456789012345678>");
    expect(made).toMatchObject({ changed: ["mass mention", "role mention"] });
  });

  it("keeps within Discord's message length, ending at a sentence", () => {
    const long = `${"A sentence of ordinary length. ".repeat(80)}`;
    const made = checkReply(long, clean);
    expect(made.ok && made.text.length).toBeLessThanOrEqual(REPLY_MAX);
    expect(made.ok && made.text.endsWith(".")).toBe(true);
    expect(made).toMatchObject({ changed: ["length"] });
  });
});

describe("capAtSentence", () => {
  it("cuts hard when there is no sentence end past halfway", () => {
    expect(capAtSentence("x".repeat(50), 20)).toBe("x".repeat(20));
    expect(capAtSentence("short", 20)).toBe("short");
  });
});

describe("makeAiBudget", () => {
  it("lets a member ask up to the hourly ceiling, then says when it lifts", () => {
    let at = now;
    const budget = makeAiBudget({ perMemberPerHour: 3, perServerPerDay: 100 }, () => at);
    for (let i = 0; i < 3; i++) {
      expect(budget.take("g", "m")).toEqual({ ok: true });
      at += 60_000;
    }
    expect(budget.take("g", "m")).toEqual({ ok: false, why: "member", retryAt: now + HOUR, firstRefusal: true });
    expect(budget.take("g", "m")).toMatchObject({ ok: false, firstRefusal: false });
    expect(budget.take("g", "someone-else")).toEqual({ ok: true });
    expect(budget.take("other-server", "m")).toEqual({ ok: true });
    at = now + HOUR;
    expect(budget.take("g", "m")).toEqual({ ok: true });
  });

  it("stops a whole server at its daily ceiling and starts again the next UTC day", () => {
    const midnight = Math.floor(now / (24 * HOUR)) * 24 * HOUR;
    let at = midnight + 5 * HOUR;
    const budget = makeAiBudget({ perMemberPerHour: 100, perServerPerDay: 2 }, () => at);
    expect(budget.take("g", "a")).toEqual({ ok: true });
    expect(budget.take("g", "b")).toEqual({ ok: true });
    expect(budget.usedToday("g")).toBe(2);
    expect(budget.take("g", "c")).toEqual({ ok: false, why: "server", retryAt: midnight + 24 * HOUR, firstRefusal: true });
    expect(budget.take("g", "d")).toMatchObject({ ok: false, why: "server", firstRefusal: false });
    at = midnight + 24 * HOUR + 1;
    expect(budget.take("g", "c")).toEqual({ ok: true });
    expect(budget.usedToday("g")).toBe(1);
  });
});

describe("budgetNotice", () => {
  it("says it once, with the time, and is quiet afterwards", () => {
    const retryAt = now + 600_000;
    expect(budgetNotice({ ok: false, why: "member", retryAt, firstRefusal: true })).toContain(`<t:${retryAt / 1000}:R>`);
    expect(budgetNotice({ ok: false, why: "server", retryAt, firstRefusal: true })).toContain("in this server today");
    expect(budgetNotice({ ok: false, why: "member", retryAt, firstRefusal: false })).toBeNull();
    expect(budgetNotice({ ok: true })).toBeNull();
  });
});
