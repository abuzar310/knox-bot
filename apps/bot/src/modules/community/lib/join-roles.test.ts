import { describe, expect, it } from "vitest";
import { ROLE_MENUS, joinRoleAsk, menuMaxValues, rulesText } from "./join-roles.js";

describe("join roles", () => {
  it("asks a new member for gender, 18+ or 18-, and games", () => {
    const text = joinRoleAsk("LUCIFER HOMETOWN");
    expect(text).toContain("**LUCIFER HOMETOWN**");
    expect(text).toContain("Male or Female");
    expect(text).toContain("18+ or 18-");
    expect(text).toContain("Games you play");
    expect(text).toContain("Chat stays closed");
  });

  it("keeps gender and age to a single choice", () => {
    const age = ROLE_MENUS.find((menu) => menu.title === "Age");
    const gender = ROLE_MENUS.find((menu) => menu.title === "Gender");
    const games = ROLE_MENUS.find((menu) => menu.title === "Games");
    expect(age?.roles.map((role) => role.name)).toEqual(["18+", "18-"]);
    expect(menuMaxValues(age!)).toBe(1);
    expect(menuMaxValues(gender!)).toBe(1);
    expect(menuMaxValues(games!)).toBe(games!.roles.length);
  });

  it("points the rules at the roles channel", () => {
    const text = rulesText([{ id: "1", name: "roles" }, { id: "2", name: "chat" }]);
    expect(text).toContain("<#1>");
    expect(text).toContain("18+ or 18-");
    expect(text).toContain("Male or Female");
  });
});
