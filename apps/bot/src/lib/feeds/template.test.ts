import { describe, expect, it } from "vitest";
import { renderAlert } from "./template.js";

const vars = { role: "", author: "MrBeast", title: "New video", url: "https://youtu.be/x", game: "", viewers: "", server: "ZARU HQ" };

describe("renderAlert", () => {
  it("uses the kind's default and drops the leading space when there is no ping", () => {
    expect(renderAlert(null, "youtube", vars)).toBe("**MrBeast** uploaded **New video**\nhttps://youtu.be/x");
  });

  it("puts the role first when there is one", () => {
    expect(renderAlert("", "youtube", { ...vars, role: "<@&1>" })).toMatch(/^<@&1> \*\*MrBeast\*\*/);
  });

  it("fills a custom template and leaves unknown braces alone", () => {
    expect(renderAlert("{author} live in {server}: {title} {nope}", "twitch", vars)).toBe("MrBeast live in ZARU HQ: New video {nope}");
  });

  it("never exceeds Discord's content limit", () => {
    expect(renderAlert("x".repeat(3000), "rss", vars).length).toBeLessThanOrEqual(1900);
  });
});
