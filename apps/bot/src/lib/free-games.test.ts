import { describe, expect, it } from "vitest";
import { parseCheapSharkDeals, unseenGames } from "./free-games.js";

describe("parseCheapSharkDeals", () => {
  it("keeps only zero-price deals and prefers a Steam link", () => {
    const games = parseCheapSharkDeals([
      { dealID: "abc", title: "Free One", salePrice: "0.00", steamAppID: "123" },
      { dealID: "paid", title: "Not free", salePrice: "4.99" },
      { junk: true },
    ]);
    expect(games).toEqual([
      { id: "abc", title: "Free One", url: "https://store.steampowered.com/app/123", store: "CheapShark" },
    ]);
  });

  it("skips deals already announced", () => {
    const games = [{ id: "a", title: "A", url: "https://example.com", store: "CheapShark" }];
    expect(unseenGames(games, ["a"])).toEqual([]);
    expect(unseenGames(games, [])).toEqual(games);
  });
});
