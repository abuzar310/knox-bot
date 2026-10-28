import { describe, expect, it } from "vitest";
import { asksAboutVisibility, formatVisibility, matchCategories, matchSubjects, nameInText } from "./visibility.js";

describe("visibility questions", () => {
  it("notices see / dekh / hidden, and ignores ordinary chat", () => {
    expect(asksAboutVisibility("par vo king space dekh sakta hai")).toBe(true);
    expect(asksAboutVisibility("check from member role he can see")).toBe(true);
    expect(asksAboutVisibility("only music is visible inside")).toBe(true);
    expect(asksAboutVisibility("what can I play")).toBe(false);
  });

  it("matches King's Space to king space, and Member to member role", () => {
    expect(nameInText("King's Space", "can he see king space")).toBe(true);
    expect(nameInText("Member", "check from member role he can see")).toBe(true);
    expect(nameInText("King's Space", "check from member role")).toBe(false);
  });

  it("picks the named role and the mentioned member", () => {
    const found = matchSubjects({
      text: "<@123> can see king space, check from member role",
      roles: [
        { id: "r1", name: "Member" },
        { id: "r2", name: "King Space" },
      ],
      members: [{ id: "123", name: "Abuzar" }],
    });
    expect(found.roles).toEqual(["r1"]);
    expect(found.members).toEqual(["123"]);
  });

  it("uses the recent chat when the question only says he", () => {
    const found = matchSubjects({
      text: "check what he can see",
      conversation: "Abuzar: can see king space",
      roles: [],
      members: [{ id: "123", name: "Abuzar" }],
    });
    expect(found.members).toEqual(["123"]);
  });

  it("finds a category named in the previous line", () => {
    expect(matchCategories([{ id: "c1", name: "King's Space" }], "what can the member role see", "only music inside king space")).toEqual(["c1"]);
  });

  it("states visible and hidden channels separately", () => {
    const text = formatVisibility([
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
    ]);
    expect(text).toContain("category itself visible");
    expect(text).toContain("#music");
    expect(text).toContain("#abuzar-dashboard");
    expect(text).toContain("Hidden channels: #team");
    expect(text).toContain("never invent a channel");
  });
});
