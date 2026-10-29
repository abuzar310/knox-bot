import { describe, expect, it } from "vitest";
import { planEmojiRole } from "./emoji-role-plan.js";

const base = {
  roleId: "a",
  panelRoleIds: ["a", "b"],
  memberRoleIds: [] as string[],
  requiredRoleId: null as string | null,
  adding: true,
};

describe("planEmojiRole", () => {
  it("adds on react and removes on unreact", () => {
    expect(planEmojiRole({ ...base, mode: "toggle" }).add).toEqual(["a"]);
    expect(planEmojiRole({ ...base, mode: "toggle", adding: false, memberRoleIds: ["a"] }).remove).toEqual(["a"]);
  });

  it("unique clears the other roles on the panel", () => {
    const plan = planEmojiRole({ ...base, mode: "unique", memberRoleIds: ["b"] });
    expect(plan.add).toEqual(["a"]);
    expect(plan.remove).toEqual(["b"]);
  });

  it("verify grants once and drops the reaction", () => {
    const plan = planEmojiRole({ ...base, mode: "verify" });
    expect(plan).toMatchObject({ add: ["a"], dropReaction: true });
    expect(planEmojiRole({ ...base, mode: "verify", adding: false, memberRoleIds: ["a"] }).remove).toEqual([]);
  });

  it("reversed takes the role away while the reaction is on", () => {
    expect(planEmojiRole({ ...base, mode: "reversed", memberRoleIds: ["a"] }).remove).toEqual(["a"]);
    expect(planEmojiRole({ ...base, mode: "reversed", adding: false }).add).toEqual(["a"]);
  });

  it("binding refuses members who lack the required role", () => {
    const plan = planEmojiRole({ ...base, mode: "binding", requiredRoleId: "gate" });
    expect(plan.error).toBeTruthy();
    expect(plan.add).toEqual([]);
    expect(plan.dropReaction).toBe(true);
  });
});
