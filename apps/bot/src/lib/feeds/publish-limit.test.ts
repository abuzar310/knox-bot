import { describe, expect, it } from "vitest";
import { PublishLimiter } from "./publish-limit.js";

describe("PublishLimiter", () => {
  it("allows ten publishes an hour per channel, then refuses until the window moves on", () => {
    const limiter = new PublishLimiter(10, 60 * 60_000);
    const t0 = 1_000_000;
    for (let i = 0; i < 10; i++) expect(limiter.take("c1", t0 + i)).toBe(true);
    expect(limiter.take("c1", t0 + 10)).toBe(false);
    // other channels have their own allowance
    expect(limiter.take("c2", t0 + 10)).toBe(true);
    // once the oldest stamps are an hour old there is room again
    expect(limiter.take("c1", t0 + 60 * 60_000 + 1)).toBe(true);
  });
});
