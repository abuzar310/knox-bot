import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseFeedKind, parseFeedSource } from "./feed-source.ts";

describe("parseFeedSource", () => {
  it("reads YouTube channel ids from a link or the public feed URL", () => {
    const id = "UCBJycsmduvYEL83R_U4JriQ";
    assert.equal(parseFeedSource("youtube", id).source, id);
    assert.equal(parseFeedSource("youtube", `https://www.youtube.com/channel/${id}`).source, id);
    assert.equal(
      parseFeedSource("youtube", `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`).source,
      id,
    );
    assert.throws(() => parseFeedSource("youtube", "@mkbhd"), /UC/);
  });

  it("keeps an https RSS URL and slugs for the live platforms", () => {
    assert.equal(parseFeedSource("rss", "https://example.com/feed.xml").source, "https://example.com/feed.xml");
    assert.equal(parseFeedSource("twitch", "https://www.twitch.tv/pokimane").source, "pokimane");
    assert.equal(parseFeedSource("kick", "https://kick.com/xqc").source, "xqc");
    assert.equal(parseFeedSource("bluesky", "@jay.bsky.team").source, "jay.bsky.team");
    assert.equal(parseFeedSource("bluesky", "jay").source, "jay.bsky.social");
    assert.equal(parseFeedKind("YouTube"), "youtube");
  });
});
