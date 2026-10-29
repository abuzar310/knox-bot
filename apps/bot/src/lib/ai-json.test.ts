import { describe, expect, it } from "vitest";
import { extractJson, geminiAnswerText } from "./ai-json.js";
import { ownershipRefusal } from "./assistant/chat.js";

describe("extractJson", () => {
  it("keeps the first object when the model adds a second one", () => {
    const raw = '{"reply":"Timing Suhaib out.","actions":[{"type":"timeout","args":{"member":"Suhaib","minutes":10}}]} {"reply":"extra"}';
    expect(extractJson(raw)).toEqual({
      reply: "Timing Suhaib out.",
      actions: [{ type: "timeout", args: { member: "Suhaib", minutes: 10 } }],
    });
  });

  it("ignores a brace inside a string", () => {
    expect(extractJson('{"reply":"use {user}","actions":[]}')).toEqual({ reply: "use {user}", actions: [] });
  });

  it("skips a thought part and keeps the JSON", () => {
    const text = geminiAnswerText([
      { thought: true, text: "planning { not closed" },
      { text: '{"reply":"Banning them.","actions":[]}' },
    ]);
    expect(extractJson(text)).toEqual({ reply: "Banning them.", actions: [] });
  });
});

describe("ownership refusal", () => {
  it("refuses a request to have ownership transferred", () => {
    expect(ownershipRefusal("@Abuzar ko bol merko ownership transfer kare")).toMatch(/nahi kar sakta/);
    expect(ownershipRefusal("who tried to ban me")).toBe("");
  });
});
