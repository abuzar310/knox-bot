import { describe, expect, it } from "vitest";
import { trackFromInnertube } from "./youtube.js";

describe("trackFromInnertube", () => {
  it("pulls the first videoRenderer", () => {
    const track = trackFromInnertube({
      contents: {
        itemSectionRenderer: {
          contents: [
            {
              videoRenderer: {
                videoId: "34Na4j8AVgA",
                title: { runs: [{ text: "The Weeknd - Starboy" }] },
                ownerText: { runs: [{ text: "The Weeknd" }] },
                lengthText: { simpleText: "4:16" },
              },
            },
          ],
        },
      },
    });
    expect(track?.url).toBe("https://www.youtube.com/watch?v=34Na4j8AVgA");
    expect(track?.title).toBe("The Weeknd - Starboy");
    expect(track?.duration).toBe(256);
  });
});
