import { describe, expect, it } from "vitest";
import { renderTag } from "./tag-render.js";

const ctx = {
  user: "<@1>",
  username: "ada",
  server: "Knox",
  channel: "chat",
  memberCount: "12",
  args: "hello",
};

describe("renderTag", () => {
  it("fills the known variables", () => {
    expect(renderTag("Hi {user} in {server} ({membercount}) {args}", ctx)).toBe("Hi <@1> in Knox (12) hello");
  });

  it("picks one choice", () => {
    expect(renderTag("{choose:red|blue}", ctx, () => 0.9)).toBe("blue");
    expect(renderTag("{choose:red|blue}", ctx, () => 0)).toBe("red");
  });
});
