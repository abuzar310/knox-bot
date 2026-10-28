import { describe, expect, it } from "vitest";
import { grantBlocked, normalizeCommandName } from "./safety-rules.js";
import { protectedBlock } from "../modules/moderation/lib/modlog.js";

describe("safety rules", () => {
  it("normalizes a slash name", () => {
    expect(normalizeCommandName("  /Kick  ")).toBe("kick");
    expect(normalizeCommandName("eco balance")).toBe("eco");
  });

  it("refuses grants of high-level commands", () => {
    expect(grantBlocked("ban")).toBe(true);
    expect(grantBlocked("tempban")).toBe(true);
    expect(grantBlocked("safety")).toBe(true);
    expect(grantBlocked("set-rank-role")).toBe(true);
    expect(grantBlocked("kick")).toBe(false);
  });

  it("blocks a member who wears a protected role", () => {
    const member = { roles: { cache: { has: (id: string) => id === "r1" } } };
    expect(protectedBlock(member, ["r1"])).toMatch(/protected role/);
    expect(protectedBlock(member, ["other"])).toBeNull();
    expect(protectedBlock(member, [])).toBeNull();
  });
});
