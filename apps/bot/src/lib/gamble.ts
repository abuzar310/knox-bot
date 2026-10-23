// Slot and coin maths, pure so the odds can be checked in tests. Payouts are a little under even, like a real house.

export const SLOT_SYMBOLS = ["🍒", "🍋", "🍇", "🔔", "⭐", "7️⃣"] as const;
export type SlotSymbol = (typeof SLOT_SYMBOLS)[number];

export const MIN_BET = 10;
export const MAX_BET = 10_000;

export function spinSlots(rng: () => number = Math.random): [SlotSymbol, SlotSymbol, SlotSymbol] {
  const pick = () => SLOT_SYMBOLS[Math.min(SLOT_SYMBOLS.length - 1, Math.floor(rng() * SLOT_SYMBOLS.length))] as SlotSymbol;
  return [pick(), pick(), pick()];
}

/** how many times the bet comes back: three sevens 30×, any three 10×, a pair 1.5×, else nothing */
export function slotsMultiplier(reels: readonly [SlotSymbol, SlotSymbol, SlotSymbol]): number {
  const [a, b, c] = reels;
  if (a === b && b === c) return a === "7️⃣" ? 30 : 10;
  if (a === b || b === c || a === c) return 1.5;
  return 0;
}

export function slotsPayout(reels: readonly [SlotSymbol, SlotSymbol, SlotSymbol], bet: number): number {
  return Math.floor(bet * slotsMultiplier(reels));
}

export function flipCoin(rng: () => number = Math.random): "heads" | "tails" {
  return rng() < 0.5 ? "heads" : "tails";
}
