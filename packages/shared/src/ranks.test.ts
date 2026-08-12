import { describe, expect, it } from "vitest";
import { hasMinRank } from "./ranks.js";

describe("hasMinRank", () => {
  it("allows admin for mod requirement", () => {
    expect(hasMinRank("admin", "mod")).toBe(true);
  });

  it("denies member for mod requirement", () => {
    expect(hasMinRank("member", "mod")).toBe(false);
  });

  it("allows owner for every rank", () => {
    expect(hasMinRank("owner", "admin")).toBe(true);
    expect(hasMinRank("owner", "member")).toBe(true);
  });
});
