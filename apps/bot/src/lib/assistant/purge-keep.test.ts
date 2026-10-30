import { describe, expect, it } from "vitest";
import type { Message } from "discord.js";
import { isScamImagePing, isScamSweepAsk, pickKeepIds, scamSweepIsWholeServer } from "../../modules/moderation/lib/purge-messages.js";
import { greetingReply, makerReply, recentSetupReply } from "./chat.js";

function msg(partial: { id: string; authorId: string; content: string; embed?: string; at: number }): Message {
  return {
    id: partial.id,
    content: partial.content,
    createdTimestamp: partial.at,
    author: { id: partial.authorId },
    embeds: partial.embed ? [{ title: "ZARU", description: partial.embed }] : [],
  } as unknown as Message;
}

describe("purge keep", () => {
  it("keeps the long greeting, not the newest command", () => {
    const kept = pickKeepIds(
      [
        msg({ id: "greet", authorId: "bot", content: "", embed: "Sabhi members ka swagat hai LUCIFER HOMETOWN mein. ".repeat(4), at: 1 }),
        msg({ id: "ask", authorId: "staff", content: "?purge unnecessary messages, keep one big greeting announcement here", at: 2 }),
        msg({ id: "status", authorId: "bot", content: "", embed: "Should I do it? This cannot be undone.", at: 3 }),
      ],
      1,
      "staff",
      "bot",
    );
    expect([...kept]).toEqual(["greet"]);
  });

  it("treats an @everyone image pile as scam and leaves normal chat", () => {
    expect(isScamSweepAsk("remove these image scam types")).toBe(true);
    expect(scamSweepIsWholeServer("remove scam posts across the whole server")).toBe(true);
    expect(scamSweepIsWholeServer("remove scam posts")).toBe(false);
    expect(greetingReply("heyyy")).toBe("Hey. What do you need?");
    expect(makerReply("who made you")).toBe("I'm ZARU, made by Abuzar.");
    expect(makerReply("kisne banaya")).toMatch(/Abuzar/);
    expect(makerReply("who tried to ban me")).toBe("");
    expect(greetingReply("remove scam posts")).toBe("");
    expect(recentSetupReply("what we recently added into you")).toMatch(/^I set it up\./);
    expect(recentSetupReply("what we recently added into you")).toContain("18+");
    expect(recentSetupReply("what we recently added into you")).toContain("dashboard");
    expect(recentSetupReply("delete what we recently added")).toBe("");
    expect(isScamSweepAsk("?purge 100")).toBe(false);
    expect(isScamImagePing({ content: "bro @everyone", attachments: 4 })).toBe(true);
    expect(isScamImagePing({ content: "On average, how many times a week? @everyone", attachments: 4 })).toBe(false);
    expect(isScamImagePing({ content: "@everyone server rules are posted", attachments: 0 })).toBe(false);
    expect(isScamImagePing({ content: "look at this", attachments: 4 })).toBe(false);
  });
});
