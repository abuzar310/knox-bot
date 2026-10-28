import { describe, expect, it } from "vitest";
import { NO_ADMIN_POWER, NO_BOT_PERMISSION, NO_MOD_POWER, botPermissionLine, deniedByRank, isDiscordPermissionError, isModerationAsk } from "./discord-perm.js";
import { isAssistantStaff } from "./run.js";

describe("discord permission errors", () => {
  it("maps Discord missing-permission codes to a plain line", () => {
    expect(isDiscordPermissionError({ code: 50013 })).toBe(true);
    expect(isDiscordPermissionError({ code: 50001 })).toBe(true);
    expect(botPermissionLine({ code: 50013, message: "Missing Permissions" })).toBe(NO_BOT_PERMISSION);
    expect(botPermissionLine(new Error("something else"))).toBe("something else");
  });

  it("treats lock/kick asks from members as moderation", () => {
    expect(isModerationAsk("lock this channel")).toBe(true);
    expect(isModerationAsk("can u lock this channel")).toBe(true);
    expect(isModerationAsk("create a private channel")).toBe(true);
    expect(isModerationAsk("give me 1000 coins")).toBe(true);
    expect(isModerationAsk("hello what is 2+2")).toBe(false);
    expect(isModerationAsk("how do I play blackjack")).toBe(false);
    expect(isModerationAsk("create a story about space")).toBe(false);
    expect(NO_MOD_POWER).toMatch(/moderation power/i);
    expect(deniedByRank("member", "mod")).toBe(NO_MOD_POWER);
    expect(deniedByRank("dj", "mod")).toBe(NO_MOD_POWER);
    expect(deniedByRank("mod", "admin")).toBe(NO_ADMIN_POWER);
  });

  it("does not treat a regular member as assistant staff", () => {
    const member = {
      id: "2",
      guild: { ownerId: "1" },
      permissions: { has: () => false },
    } as never;
    expect(isAssistantStaff(member, "member")).toBe(false);
    expect(isAssistantStaff(member, "dj")).toBe(false);
    expect(isAssistantStaff(member, "mod")).toBe(true);
    expect(isAssistantStaff(member, "admin")).toBe(true);
    const owner = { id: "1", guild: { ownerId: "1" }, permissions: { has: () => false } } as never;
    expect(isAssistantStaff(owner, "member")).toBe(true);
  });
});
