import { describe, expect, it } from "vitest";
import {
  parseSpotifyEmbedTracks,
  parseViewCount,
  pickFamousTrack,
  splitPlayNames,
  trackFromInnertube,
} from "./youtube.js";

function video(id: string, title: string, length: string, views: string) {
  return {
    videoRenderer: {
      videoId: id,
      title: { runs: [{ text: title }] },
      ownerText: { runs: [{ text: "Artist" }] },
      lengthText: { simpleText: length },
      viewCountText: { simpleText: views },
    },
  };
}

describe("parseViewCount", () => {
  it("reads compact and full counts", () => {
    expect(parseViewCount("1.2M views")).toBe(1_200_000);
    expect(parseViewCount("1,234,567 views")).toBe(1_234_567);
    expect(parseViewCount("980K views")).toBe(980_000);
  });
});

describe("pickFamousTrack", () => {
  it("skips shorts even when they have more views", () => {
    const pick = pickFamousTrack([
      { title: "Song #shorts", duration: 28, views: 50_000_000 },
      { title: "Song Official Audio", duration: 240, views: 8_000_000 },
    ]);
    expect(pick?.title).toBe("Song Official Audio");
  });

  it("picks the most viewed full song", () => {
    const pick = pickFamousTrack([
      { title: "Cover", duration: 210, views: 200_000 },
      { title: "Official Music Video", duration: 230, views: 12_000_000 },
    ]);
    expect(pick?.title).toBe("Official Music Video");
  });
});

describe("trackFromInnertube", () => {
  it("picks the famous full video, not the first short", () => {
    const track = trackFromInnertube({
      contents: {
        itemSectionRenderer: {
          contents: [
            video("short1", "Kalyani Shorts", "0:32", "9M views"),
            video("og1", "Kalyani Official Video", "4:16", "41M views"),
            video("cover1", "Kalyani cover", "3:50", "120K views"),
          ],
        },
      },
    });
    expect(track?.url).toBe("https://www.youtube.com/watch?v=og1");
    expect(track?.title).toBe("Kalyani Official Video");
    expect(track?.duration).toBe(256);
  });
});

describe("splitPlayNames", () => {
  it("splits up to 10 names", () => {
    expect(splitPlayNames("starboy, blinding lights, die for you")).toEqual([
      "starboy",
      "blinding lights",
      "die for you",
    ]);
    expect(splitPlayNames("kalyani")).toEqual(["kalyani"]);
  });
});

describe("parseSpotifyEmbedTracks", () => {
  it("reads title and artist from the live embed shape", () => {
    const html =
      `"uri":"spotify:track:aaa","uid":"1","title":"Ain't In LA","subtitle":"ADÉLA","uri":"spotify:track:bbb","title":"Starboy","subtitle":"The Weeknd"`;
    expect(parseSpotifyEmbedTracks(html)).toEqual(["ADÉLA Ain't In LA", "The Weeknd Starboy"]);
  });
});
