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

  it("changes case and rolls a range", () => {
    expect(renderTag("{upper:hi} {lower:YO}", ctx, () => 0)).toBe("HI yo");
    expect(renderTag("{range:1-3}", ctx, () => 0)).toBe("1");
    expect(renderTag("{range:1-3}", ctx, () => 0.99)).toBe("3");
  });

  it("picks one choice", () => {
    expect(renderTag("{choose:red|blue}", ctx, () => 0.9)).toBe("blue");
    expect(renderTag("{choose:red|blue}", ctx, () => 0)).toBe("red");
  });
});
