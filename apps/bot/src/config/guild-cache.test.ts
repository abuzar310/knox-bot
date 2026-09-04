import { describe, expect, it } from "vitest";
import { firstResolved } from "./guild-cache.js";

describe("firstResolved", () => {
  it("returns the fallback when the promise is slow", async () => {
    const slow = new Promise<string>((resolve) => {
      setTimeout(() => resolve("late"), 50);
    });
    await expect(firstResolved(slow, 10, "now")).resolves.toBe("now");
  });

  it("returns the promise when it wins", async () => {
    await expect(firstResolved(Promise.resolve("fast"), 50, "now")).resolves.toBe(
      "fast",
    );
  });
});
