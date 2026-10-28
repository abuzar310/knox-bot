import { describe, expect, it } from "vitest";
import { guessStaffRolesFrom } from "./rank-setup.js";

describe("guessStaffRolesFrom", () => {
  it("picks Admin and Moderator by name", () => {
    const guess = guessStaffRolesFrom([
      { id: "everyone", name: "@everyone", position: 0, everyone: true },
      { id: "a", name: "Admin", position: 10 },
      { id: "m", name: "Moderator", position: 8 },
      { id: "g", name: "Gamer", position: 2 },
    ]);
    expect(guess.admin).toBe("a");
    expect(guess.mod).toBe("m");
  });

  it("falls back to Discord permissions when names are generic", () => {
    const guess = guessStaffRolesFrom([
      { id: "a", name: "Team", position: 10, manageGuild: true },
      { id: "m", name: "Helpers", position: 8, kick: true },
      { id: "g", name: "Member", position: 1 },
    ]);
    expect(guess.admin).toBe("a");
    expect(guess.mod).toBe("m");
  });

  it("does not map the same role twice", () => {
    const guess = guessStaffRolesFrom([{ id: "one", name: "Admin", position: 5, kick: true }]);
    expect(guess.admin).toBe("one");
    expect(guess.mod).toBeUndefined();
  });

  it("ignores @everyone and bot roles", () => {
    const guess = guessStaffRolesFrom([
      { id: "e", name: "Admin", position: 0, everyone: true },
      { id: "b", name: "Moderator", position: 9, managed: true },
    ]);
    expect(guess.admin).toBeUndefined();
    expect(guess.mod).toBeUndefined();
  });
});
