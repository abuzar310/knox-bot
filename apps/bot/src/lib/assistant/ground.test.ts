import { describe, expect, it } from "vitest";
import { GROUNDED, looksFactual } from "./ground.js";
import { isVisibilityQuestion, replyLanguage, speakVisibility } from "./visibility.js";

describe("grounded replies", () => {
  it("treats server questions as facts and leaves opinions alone", () => {
    expect(looksFactual("how many channels can he see")).toBe(true);
    expect(looksFactual("kaun king space dekh sakta hai")).toBe(true);
    expect(looksFactual("what movie should we watch")).toBe(false);
    expect(GROUNDED).toMatch(/do not guess/i);
  });

  it("answers visibility from the list, and does not treat hide as a question", () => {
    expect(isVisibilityQuestion("par vo king space dekh sakta hai")).toBe(true);
    expect(isVisibilityQuestion("check from member role he can see")).toBe(true);
    expect(isVisibilityQuestion("hide this channel from the Member role")).toBe(false);
    expect(replyLanguage("check from member role he can see")).toBe("en");
    expect(replyLanguage("par vo king space dekh sakta hai")).toBe("hinglish");
  });

  it("names only the channels it was given", () => {
    const reply = speakVisibility(
      [
        {
          label: "Member Abuzar (roles: King Space):",
          categories: [
            {
              name: "King's Space",
              visible: true,
              channels: [
                { name: "music", kind: "text", visible: true },
                { name: "abuzar-dashboard", kind: "text", visible: true },
                { name: "team", kind: "text", visible: false },
              ],
            },
          ],
        },
      ],
      "@Abuzar can see king space but only music and abuzar-dashboard",
    );
    expect(reply).toContain("Abuzar can see the King's Space category");
    expect(reply).toContain("#music and #abuzar-dashboard");
    expect(reply).toContain("Hidden: #team");
    expect(reply).not.toMatch(/bot-training|etc\.|and others/i);
  });
});
