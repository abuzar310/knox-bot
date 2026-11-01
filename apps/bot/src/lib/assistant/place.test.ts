import { describe, expect, it } from "vitest";
import { besidePlacement } from "./place.js";

describe("besidePlacement", () => {
  it("reads above and below", () => {
    expect(besidePlacement("above Music")).toEqual({ side: "above", anchor: "Music" });
    expect(besidePlacement("below #music")).toEqual({ side: "below", anchor: "#music" });
    expect(besidePlacement("top")).toBeNull();
  });
});
