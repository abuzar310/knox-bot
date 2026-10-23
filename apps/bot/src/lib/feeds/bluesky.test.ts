import { describe, expect, it } from "vitest";
import { blueskyActorFrom } from "./bluesky.js";

describe("blueskyActorFrom", () => {
  it("accepts handles, bare names, profile links and DIDs", () => {
    expect(blueskyActorFrom("@jay.bsky.team")).toBe("jay.bsky.team");
    expect(blueskyActorFrom("mkbhd")).toBe("mkbhd.bsky.social");
    expect(blueskyActorFrom("https://bsky.app/profile/jay.bsky.team/post/abc")).toBe("jay.bsky.team");
    expect(blueskyActorFrom("did:plc:z72i7hdynmk6r22z27h6tvur")).toBe("did:plc:z72i7hdynmk6r22z27h6tvur");
  });
  it("refuses things that are not accounts", () => {
    expect(blueskyActorFrom("not an account!")).toBeNull();
    expect(blueskyActorFrom("https://example.com/profile/x")).toBeNull();
  });
});
