import { describe, expect, it } from "vitest";
import { SLOT_SYMBOLS, flipCoin, slotsMultiplier, slotsPayout, spinSlots } from "./gamble.js";

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
});
