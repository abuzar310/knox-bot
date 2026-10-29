import { describe, expect, it } from "vitest";
import { firstHit, ruleHits, type AutomodRule, type MessageFacts } from "./automod-rules.js";

function rule(partial: Partial<AutomodRule> & Pick<AutomodRule, "kind">): AutomodRule {
  return {
    id: "r1",
    enabled: true,
    action: "delete",
    timeoutMinutes: 10,
    threshold: 5,
    windowSec: 7,
    words: [],
    ignoredChannelIds: [],
    ignoredRoleIds: [],
    ...partial,
  };
}

function facts(partial: Partial<MessageFacts> = {}): MessageFacts {
  return {
    content: "hello",
    channelId: "1",
    roleIds: [],
    mentionCount: 0,
    attachmentCount: 0,
    recentCount: 1,
    recentDuplicate: false,
    ...partial,
  };
}

describe("ruleHits", () => {
  it("skips ignored channels and roles", () => {
    const r = rule({ kind: "links", ignoredChannelIds: ["9"], ignoredRoleIds: ["staff"] });
    expect(ruleHits(r, facts({ content: "https://example.com", channelId: "9" }))).toBe(false);
    expect(ruleHits(r, facts({ content: "https://example.com", roleIds: ["staff"] }))).toBe(false);
    expect(ruleHits(r, facts({ content: "https://example.com" }))).toBe(true);
  });

  it("matches caps as a percent and words as a substring", () => {
    expect(ruleHits(rule({ kind: "caps", threshold: 70 }), facts({ content: "HELLO THERE FRIEND" }))).toBe(true);
    expect(ruleHits(rule({ kind: "caps", threshold: 70 }), facts({ content: "Hello there friend" }))).toBe(false);
    expect(ruleHits(rule({ kind: "words", words: ["scam"] }), facts({ content: "this is a Scam link" }))).toBe(true);
  });

  it("returns the first matching rule", () => {
    const hit = firstHit(
      [rule({ id: "off", kind: "links", enabled: false }), rule({ id: "on", kind: "invites" })],
      facts({ content: "join discord.gg/abc" }),
    );
    expect(hit?.id).toBe("on");
  });
});
