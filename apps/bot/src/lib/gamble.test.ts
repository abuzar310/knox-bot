import { describe, expect, it } from "vitest";
import { SLOT_SYMBOLS, flipCoin, slotsMultiplier, slotsPayout, spinSlots, newDeck, handValue, dealerPlay, rouletteColor, rouletteMultiplier } from "./gamble.js";

describe("slots", () => {
  it("pays three sevens most, any triple next, a pair a little", () => {
    expect(slotsMultiplier(["7️⃣", "7️⃣", "7️⃣"])).toBe(30);
    expect(slotsMultiplier(["🍒", "🍒", "🍒"])).toBe(10);
    expect(slotsMultiplier(["🍒", "🍋", "🍒"])).toBe(1.5);
    expect(slotsMultiplier(["🍒", "🍋", "🍇"])).toBe(0);
    expect(slotsPayout(["🍒", "🍋", "🍒"], 101)).toBe(151);
  });

  it("keeps the house slightly ahead over every combination", () => {
    let total = 0;
    let combos = 0;
    for (const a of SLOT_SYMBOLS) for (const b of SLOT_SYMBOLS) for (const c of SLOT_SYMBOLS) {
      total += slotsMultiplier([a, b, c]);
      combos++;
    }
    const expectedReturn = total / combos;
    expect(expectedReturn).toBeLessThan(1);
    expect(expectedReturn).toBeGreaterThan(0.9);
  });

  it("spins with the given randomness and never leaves the symbol set", () => {
    expect(spinSlots(() => 0)).toEqual(["🍒", "🍒", "🍒"]);
    expect(spinSlots(() => 0.999)).toEqual(["7️⃣", "7️⃣", "7️⃣"]);
    expect(flipCoin(() => 0.2)).toBe("heads");
    expect(flipCoin(() => 0.7)).toBe("tails");
  });

  it("values blackjack hands with soft aces", () => {
    const c = (rank: number) => ({ rank, suit: 0 });
    expect(handValue([c(1), c(13)])).toBe(21);
    expect(handValue([c(1), c(1), c(9)])).toBe(21);
    expect(handValue([c(1), c(5)])).toBe(16);
    expect(handValue([c(1), c(5), c(10)])).toBe(16);
    expect(handValue([c(10), c(9), c(5)])).toBe(24);
  });

  it("deals a full unique deck and the dealer draws to seventeen", () => {
    const deck = newDeck(() => 0.42);
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((d) => `${d.rank}-${d.suit}`)).size).toBe(52);
    const hand = [{ rank: 10, suit: 0 }, { rank: 2, suit: 1 }];
    dealerPlay(deck, hand);
    expect(handValue(hand)).toBeGreaterThanOrEqual(17);
  });

  it("pays roulette correctly", () => {
    expect(rouletteColor(0)).toBe("green");
    expect(rouletteColor(1)).toBe("red");
    expect(rouletteColor(2)).toBe("black");
    expect(rouletteMultiplier({ kind: "red" }, 1)).toBe(2);
    expect(rouletteMultiplier({ kind: "red" }, 2)).toBe(0);
    expect(rouletteMultiplier({ kind: "odd" }, 0)).toBe(0);
    expect(rouletteMultiplier({ kind: "even" }, 0)).toBe(0);
    expect(rouletteMultiplier({ kind: "green" }, 0)).toBe(14);
    expect(rouletteMultiplier({ kind: "number", number: 17 }, 17)).toBe(36);
    expect(rouletteMultiplier({ kind: "number", number: 17 }, 16)).toBe(0);
  });
});
