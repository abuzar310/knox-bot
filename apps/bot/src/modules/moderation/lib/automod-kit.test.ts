import { describe, expect, it } from "vitest";
import { EDIT_FRESH_MS, hasLink, isRealEdit, makeOncePer, newAccountLink, newAccountNotice, onlyGifLinks } from "./automod-kit.js";

const DAY = 86_400_000;
const now = 1_800_000_000_000;

describe("hasLink", () => {
  it("sees an address in every form a member can post it", () => {
    for (const text of [
      "look https://example.com/x",
      "HTTP://EXAMPLE.COM",
      "go to www.example.com now",
      "join discord.gg/abc123",
      "[free nitro](https://example.com)",
      "<https://example.com>",
      "wait.https://example.com",
    ]) {
      expect(hasLink(text), text).toBe(true);
    }
  });

  it("leaves ordinary talk alone", () => {
    for (const text of ["hello.world", "awww.that is cute", "www. is how addresses used to start", "www.lol", "the https:// part", "discord.gg/ is the invite site", "see you at 5.30", ""]) {
      expect(hasLink(text), text).toBe(false);
    }
  });
});

describe("onlyGifLinks", () => {
  it("lets a GIF from the picker through", () => {
    expect(onlyGifLinks("https://tenor.com/view/cat-dance-gif-12345")).toBe(true);
    expect(onlyGifLinks("lol https://media.giphy.com/media/abc/giphy.gif")).toBe(true);
    expect(onlyGifLinks("https://www.tenor.com/view/x https://giphy.com/gifs/y")).toBe(true);
  });

  it("is not fooled by a GIF site's name inside another address", () => {
    for (const text of [
      "https://tenor.com.example.org/view/x",
      "https://tenor.com@example.org/view/x",
      "https://example.org/tenor.com/view/x",
      "https://nottenor.com/view/x",
      "http://tenor.com/view/x",
      "https://tenor.com/view/x)https://example.org",
      "https://tenor.com/view/x and https://example.org",
      "https://tenor.com/view/discord.gg/abc",
      "<https://tenor.com/view/x>",
      "no link here",
    ]) {
      expect(onlyGifLinks(text), text).toBe(false);
    }
  });
});

describe("newAccountLink", () => {
  const post = (content: string, ageDays: number, days = 3) => newAccountLink({ content, accountCreatedAt: now - ageDays * DAY, now, days });

  it("removes a link from an account younger than the limit", () => {
    expect(post("https://example.com", 0.5)).toBe(true);
    expect(post("check www.example.com", 2.9)).toBe(true);
  });

  it("allows an account that is exactly old enough, and older ones", () => {
    expect(post("https://example.com", 3)).toBe(false);
    expect(post("https://example.com", 400)).toBe(false);
  });

  it("allows talk and GIFs from a new account", () => {
    expect(post("hi everyone", 0.1)).toBe(false);
    expect(post("https://tenor.com/view/hello-gif-1", 0.1)).toBe(false);
  });

  it("is off at 0 days", () => {
    expect(post("https://example.com", 0.1, 0)).toBe(false);
  });
});

describe("newAccountNotice", () => {
  it("names the member, the limit and when their account is old enough", () => {
    const made = now - DAY;
    const text = newAccountNotice("42", made, 3);
    expect(text).toContain("<@42>");
    expect(text).toContain("younger than 3 days");
    expect(text).toContain(`<t:${(made + 3 * DAY) / 1000}:R>`);
    expect(newAccountNotice("42", made, 1)).toContain("younger than 1 day can't");
  });
});

describe("makeOncePer", () => {
  it("says yes once per key in each gap", () => {
    let at = now;
    const due = makeOncePer(600_000, () => at);
    expect(due("a")).toBe(true);
    expect(due("a")).toBe(false);
    expect(due("b")).toBe(true);
    at += 599_999;
    expect(due("a")).toBe(false);
    at += 1;
    expect(due("a")).toBe(true);
  });
});

describe("isRealEdit", () => {
  const edit = (over: Partial<Parameters<typeof isRealEdit>[0]>) => isRealEdit({ editedAt: now - 1000, now, oldContent: "hi", newContent: "hi https://example.com", ...over });

  it("is a member changing the text just now", () => {
    expect(edit({})).toBe(true);
  });

  it("is not a pin, a link preview or a new thread: the text is the same, or it was never edited", () => {
    expect(edit({ newContent: "hi" })).toBe(false);
    expect(edit({ editedAt: null })).toBe(false);
  });

  it("goes by the two texts when it has both, whatever the host's clock says", () => {
    expect(edit({ editedAt: now - 3_600_000 })).toBe(true);
    expect(edit({ editedAt: now + 3_600_000 })).toBe(true);
    expect(edit({ editedAt: now + 3_600_000, newContent: "hi" })).toBe(false);
  });

  it("goes by the time of the edit when Discord did not send the old text", () => {
    expect(edit({ oldContent: null })).toBe(true);
    expect(edit({ oldContent: null, newContent: null })).toBe(true);
    expect(edit({ oldContent: null, editedAt: now - EDIT_FRESH_MS })).toBe(true);
    expect(edit({ oldContent: null, editedAt: now - EDIT_FRESH_MS - 1 })).toBe(false);
  });
});
