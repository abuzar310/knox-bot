import { describe, expect, it } from "vitest";
import { matchAutoResponse, normalizeTrigger, renderReply, type AutoResponse } from "./auto-responses.js";

const row = (trigger: string, match: AutoResponse["match"], id = 1): AutoResponse => ({
  id,
  guildId: "g",
  trigger,
  reply: "r",
  match,
  createdBy: "u",
  createdAt: new Date(),
});

describe("auto-responses", () => {
  it("matches contains, exact and starts, ignoring case and extra spaces", () => {
    const rows = [row("server ip", "contains", 1), row("hi", "exact", 2), row("!help", "starts", 3)];
    expect(matchAutoResponse("What is the   SERVER IP please?", rows)?.id).toBe(1);
    expect(matchAutoResponse("Hi", rows)?.id).toBe(2);
    expect(matchAutoResponse("hi there", rows)).toBeNull();
    expect(matchAutoResponse("!help me", rows)?.id).toBe(3);
    expect(matchAutoResponse("can you !help", rows)).toBeNull();
  });
  it("normalises triggers and fills placeholders", () => {
    expect(normalizeTrigger("  Server   IP ")).toBe("server ip");
    expect(renderReply("Hey {user}, welcome to {server}, {username}!", null, "<@1>", "abuzar", "ZARU HQ")).toBe("Hey <@1>, welcome to ZARU HQ, abuzar!");
  });
});
