import { describe, expect, it } from "vitest";
import { prefixGamesHint } from "./prefix-zaru.js";

describe("prefixGamesHint", () => {
  it("lists UnbelievaBoat-style shortcuts", () => {
    const body = prefixGamesHint("?").embeds[0]?.data?.description ?? "";
    expect(body).toContain("? what can I play");
    expect(body).toContain("optional");
    expect(body).toContain("?slots");
    expect(body).toContain("?chicken");
    expect(body).toContain("?animal");
  });
});
