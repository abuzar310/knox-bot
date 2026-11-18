import { describe, expect, it } from "vitest";
import { accountAge, makeHandled, trapAction, trapExempt, trapReason } from "./honeypot-kit.js";

const HOUR = 3_600_000;
const now = 1_800_000_000_000;
const inTrap = { trapChannelId: "trap", channelId: "trap", isBot: false, exempt: false, firstInWindow: true };

describe("trapAction", () => {
  it("does nothing when the trap is off or the message is elsewhere", () => {
    expect(trapAction({ ...inTrap, trapChannelId: null })).toBe("ignore");
    expect(trapAction({ ...inTrap, channelId: "general" })).toBe("ignore");
  });

  it("removes whoever writes in the trap, once", () => {
    expect(trapAction(inTrap)).toBe("softban");
    expect(trapAction({ ...inTrap, firstInWindow: false })).toBe("delete");
  });

  it("only deletes a message from staff, and leaves other bots alone", () => {
    expect(trapAction({ ...inTrap, exempt: true })).toBe("delete");
    expect(trapAction({ ...inTrap, isBot: true })).toBe("ignore");
  });
});

describe("trapExempt", () => {
  it("exempts staff, the owner and protected roles", () => {
    const nobody = { isStaff: false, isOwner: false, hasProtectedRole: false };
    expect(trapExempt(nobody)).toBe(false);
    expect(trapExempt({ ...nobody, isStaff: true })).toBe(true);
    expect(trapExempt({ ...nobody, isOwner: true })).toBe(true);
    expect(trapExempt({ ...nobody, hasProtectedRole: true })).toBe(true);
  });
});

describe("makeHandled", () => {
  it("claims a member once per window, each member and server on its own", () => {
    let at = now;
    const handled = makeHandled(10 * 60_000, () => at);
    expect(handled.claim("g:a")).toBe(true);
    expect(handled.claim("g:a")).toBe(false);
    expect(handled.claim("g:b")).toBe(true);
    expect(handled.claim("other:a")).toBe(true);
    at += 10 * 60_000;
    expect(handled.claim("g:a")).toBe(true);
  });
});

describe("accountAge", () => {
  it("says a new account's age in hours and an old one's in days, months or years", () => {
    expect(accountAge(now - 20 * 60_000, now)).toBe("under an hour");
    expect(accountAge(now - HOUR, now)).toBe("1 hour");
    expect(accountAge(now - 30 * HOUR, now)).toBe("30 hours");
    expect(accountAge(now - 5 * 24 * HOUR, now)).toBe("5 days");
    expect(accountAge(now - 200 * 24 * HOUR, now)).toBe("6 months");
    expect(accountAge(now - 1100 * 24 * HOUR, now)).toBe("3 years");
  });
});

describe("trapReason", () => {
  it("keeps the account age and a short piece of the message", () => {
    const text = trapReason({ accountAge: "3 hours", content: `free   nitro\n${"x".repeat(400)}` });
    expect(text).toContain("Account age: 3 hours.");
    expect(text).toContain("Message: free nitro x");
    expect(text.length).toBeLessThan(480);
  });

  it("says so when the message had no text", () => {
    expect(trapReason({ accountAge: "2 days", content: "  " })).toContain("had no text");
  });
});
