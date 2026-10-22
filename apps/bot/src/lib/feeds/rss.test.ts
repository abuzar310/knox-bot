import { describe, expect, it } from "vitest";
import { parseFeed } from "./rss.js";

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=UCX6OQ3DkcsbYNE6H8uQQuVA"/>
 <id>yt:channel:X6OQ3DkcsbYNE6H8uQQuVA</id>
 <yt:channelId>X6OQ3DkcsbYNE6H8uQQuVA</yt:channelId>
 <title>MrBeast</title>
 <link rel="alternate" href="https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA"/>
 <author><name>MrBeast</name><uri>https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA</uri></author>
 <published>2012-02-20T00:43:50+00:00</published>
 <entry>
  <id>yt:video:abc123DEF45</id>
  <yt:videoId>abc123DEF45</yt:videoId>
  <yt:channelId>UCX6OQ3DkcsbYNE6H8uQQuVA</yt:channelId>
  <title>I Spent 7 Days &amp; Nights Here</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=abc123DEF45"/>
  <author><name>MrBeast</name><uri>https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA</uri></author>
  <published>2026-10-20T16:00:00+00:00</published>
  <updated>2026-10-21T10:00:00+00:00</updated>
  <media:group><media:title>I Spent 7 Days &amp; Nights Here</media:title></media:group>
 </entry>
 <entry>
  <id>yt:video:zzz999</id>
  <title>Older one</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=zzz999"/>
  <published>2026-10-01T16:00:00+00:00</published>
 </entry>
</feed>`;

const RSS = `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title><![CDATA[Example Blog]]></title><link>https://example.com</link>
<item><title><![CDATA[Hello <world>]]></title><link>https://example.com/hello</link><guid isPermaLink="false">post-1</guid><pubDate>Tue, 20 Oct 2026 10:00:00 GMT</pubDate><dc:creator>Jane</dc:creator></item>
<item><title>Second</title><link>https://example.com/second</link></item>
</channel></rss>`;

describe("parseFeed", () => {
  it("reads a YouTube Atom feed: ids, watch links, authors and dates", () => {
    const doc = parseFeed(ATOM);
    expect(doc.title).toBe("MrBeast");
    expect(doc.items).toHaveLength(2);
    expect(doc.items[0]).toMatchObject({
      id: "yt:video:abc123DEF45",
      title: "I Spent 7 Days & Nights Here",
      url: "https://www.youtube.com/watch?v=abc123DEF45",
      author: "MrBeast",
    });
    expect(doc.items[0]!.publishedAt?.toISOString()).toBe("2026-10-20T16:00:00.000Z");
    // an entry without its own author falls back to the feed's
    expect(doc.items[1]!.author).toBe("MrBeast");
  });

  it("reads RSS 2.0 with CDATA, guids and dc:creator", () => {
    const doc = parseFeed(RSS);
    expect(doc.title).toBe("Example Blog");
    expect(doc.items[0]).toMatchObject({ id: "post-1", title: "Hello <world>", url: "https://example.com/hello", author: "Jane" });
    expect(doc.items[0]!.publishedAt?.toISOString()).toBe("2026-10-20T10:00:00.000Z");
    // no guid: the link is the id; no author: the channel's title stands in; no date stays null
    expect(doc.items[1]).toMatchObject({ id: "https://example.com/second", author: "Example Blog", publishedAt: null });
  });

  it("refuses something that is not a feed", () => {
    expect(() => parseFeed("<html><body>nope</body></html>")).toThrow(/RSS or Atom/);
  });
});
