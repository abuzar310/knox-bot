import { describe, expect, it } from "vitest";
import { extractChannelId, extractChannelTitle, youtubeFeedUrl, youtubeLookupUrl } from "./youtube.js";

describe("youtube lookups", () => {
  it("turns handles and links into the page to read", () => {
    expect(youtubeLookupUrl("@mkbhd")).toBe("https://www.youtube.com/@mkbhd");
    expect(youtubeLookupUrl("mkbhd")).toBe("https://www.youtube.com/@mkbhd");
    expect(youtubeLookupUrl("https://youtube.com/@mkbhd/videos")).toBe("https://www.youtube.com/@mkbhd/videos");
    expect(youtubeLookupUrl("https://www.youtube.com/c/SomeName")).toBe("https://www.youtube.com/c/SomeName");
    expect(youtubeLookupUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(youtubeLookupUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=1")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1");
    expect(youtubeLookupUrl("https://example.com/@mkbhd")).toBeNull();
    expect(youtubeLookupUrl("not a handle!!")).toBeNull();
  });

  it("finds the channel id and title in page HTML, preferring the page's own channel", () => {
    const channelPage =
      '<html><head><title>MKBHD - YouTube</title><meta property="og:title" content="Marques Brownlee"><meta itemprop="identifier" content="UCBJycsmduvYEL83R_U4JriQ"></head>' +
      '<body><script>var ytInitialData = {"channelId":"UCother00000000000000000"}</script></body></html>';
    expect(extractChannelId(channelPage)).toBe("UCBJycsmduvYEL83R_U4JriQ");
    expect(extractChannelTitle(channelPage)).toBe("Marques Brownlee");
    const videoPage = '<meta itemprop="channelId" content="UCX6OQ3DkcsbYNE6H8uQQuVA"><script>{"channelId":"UCrecommended0000000000"}</script>';
    expect(extractChannelId(videoPage)).toBe("UCX6OQ3DkcsbYNE6H8uQQuVA");
    expect(extractChannelId("<html>nothing</html>")).toBeNull();
    expect(extractChannelTitle("<title>Tom &amp; Jerry - YouTube</title>")).toBe("Tom & Jerry");
  });

  it("builds the public feed URL", () => {
    expect(youtubeFeedUrl("UCBJycsmduvYEL83R_U4JriQ")).toBe("https://www.youtube.com/feeds/videos.xml?channel_id=UCBJycsmduvYEL83R_U4JriQ");
  });
});
