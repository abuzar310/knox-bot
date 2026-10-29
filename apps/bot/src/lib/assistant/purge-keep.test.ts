import { describe, expect, it } from "vitest";
import type { Message } from "discord.js";
import { pickKeepIds } from "../../modules/moderation/lib/purge-messages.js";

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
});
