import { describe, expect, it } from "vitest";
import { CHAT_LOOKBACK, duplicateReply, isDuplicateQuestion, renderChatLine, windowRecent, type ChatMessage } from "./chat.js";

const panel = (id: string): ChatMessage => ({
  id,
  authorId: "bot",
  authorName: "ZARU",
  content: "",
  embeds: [{ title: "Need help?", description: "Press the button and tell us a little; a private channel with staff opens for you." }],
  controls: ["Open ticket"],
});

describe("previous chat", () => {
  it("reads an embed and its button even when the message has no text", () => {
    const line = renderChatLine("bot", panel("1"));
    expect(line).toContain("ZARU:");
    expect(line).toContain("[embed] Need help?");
    expect(line).toContain("[buttons] Open ticket");
  });

  it("keeps the last 10 readable messages", () => {
    const messages = Array.from({ length: 12 }, (_, index) => panel(String(index + 1)));
    messages.splice(3, 0, { id: "empty", authorId: "u", authorName: "Abuzar", content: "   ", embeds: [], controls: [] });
    const chat = windowRecent("bot", messages);
    expect(chat.window).toHaveLength(CHAT_LOOKBACK);
    expect(chat.window[0]?.id).toBe("3");
    expect(chat.window.at(-1)?.id).toBe("12");
    expect(chat.text).not.toContain("empty");
  });

  it("answers a duplicate from those panels, in the asker's language", () => {
    const window = [panel("1"), panel("2")];
    expect(isDuplicateQuestion("is this a duplicate")).toBe(true);
    expect(isDuplicateQuestion("here are two open ticket button")).toBe(true);
    expect(isDuplicateQuestion("delete the duplicate panel")).toBe(false);
    const reply = duplicateReply(window, "is this a duplicate");
    expect(reply).toMatch(/^Yes\./);
    expect(reply).toContain('2 copies of "Need help?" with Open ticket');
    expect(reply).not.toMatch(/setup|kar sakte|what are you referring/i);
    expect(duplicateReply(window, "here are two open ticket button")).toMatch(/^Yes\./);
    expect(duplicateReply([panel("1")], "is this a duplicate")).toMatch(/^No\./);
  });
});
