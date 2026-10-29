import { describe, expect, it } from "vitest";
import { allowsMediaOnlyPost } from "./media-only.js";
import { CHAT_PASS_ROLE, stickyRoleNames, stickyStillValid, STICKY_WINDOW_MS } from "./join-roles.js";

describe("media only", () => {
  it("keeps pictures, stickers, and links", () => {
    expect(allowsMediaOnlyPost({ content: "", attachments: 1, stickers: 0 })).toBe(true);
    expect(allowsMediaOnlyPost({ content: "look", attachments: 0, stickers: 1 })).toBe(true);
    expect(allowsMediaOnlyPost({ content: "clip https://youtu.be/abc", attachments: 0, stickers: 0 })).toBe(true);
  });

  it("drops plain text", () => {
    expect(allowsMediaOnlyPost({ content: "hello", attachments: 0, stickers: 0 })).toBe(false);
    expect(allowsMediaOnlyPost({ content: "", attachments: 0, stickers: 0 })).toBe(false);
  });
});

describe("sticky roles", () => {
  it("saves self roles and chat access, not staff roles", () => {
    const names = stickyRoleNames();
    expect(names.has("18+")).toBe(true);
    expect(names.has("18-")).toBe(true);
    expect(names.has("female")).toBe(true);
    expect(names.has(CHAT_PASS_ROLE.toLowerCase())).toBe(true);
    expect(names.has("owner")).toBe(false);
    expect(names.has("admin")).toBe(false);
  });

  it("expires after 30 days", () => {
    const left = new Date("2026-01-01T00:00:00Z");
    expect(stickyStillValid(left, left.getTime() + STICKY_WINDOW_MS)).toBe(true);
    expect(stickyStillValid(left, left.getTime() + STICKY_WINDOW_MS + 1)).toBe(false);
  });
});
