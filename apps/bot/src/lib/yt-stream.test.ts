import { describe, expect, it } from "vitest";
import { youtubeJsArgs } from "./yt-stream.js";

describe("youtubeJsArgs", () => {
  it("points yt-dlp at the Node process that is already running", () => {
    expect(youtubeJsArgs()).toEqual(["--js-runtimes", `node:${process.execPath}`]);
  });
});
