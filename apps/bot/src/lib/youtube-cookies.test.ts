import { describe, expect, it } from "vitest";
import { cookieExpiry } from "./youtube-cookies.js";

describe("cookieExpiry", () => {
  it("keeps a cookie that was exported without an expiry date", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(cookieExpiry(undefined)).toBeGreaterThan(now + 60 * 60 * 24);
    expect(cookieExpiry(1_700_000_000_000)).toBe(1_700_000_000);
    expect(cookieExpiry(1_700_000_000)).toBe(1_700_000_000);
  });
});
