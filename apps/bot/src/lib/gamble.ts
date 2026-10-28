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

// ─── blackjack (UnbelievaBoat style): hit/stand against a dealer who draws to 17 ───

export type Card = { rank: number; suit: number };
const SUITS = ["♠", "♥", "♦", "♣"] as const;
const RANK_LABEL = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;

export function newDeck(rng: () => number = Math.random): Card[] {
  const deck: Card[] = [];
  for (let suit = 0; suit < 4; suit += 1) for (let rank = 1; rank <= 13; rank += 1) deck.push({ rank, suit });
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

export const cardLabel = (c: Card) => `${RANK_LABEL[c.rank - 1]}${SUITS[c.suit]}`;
export const handLabel = (cards: Card[]) => cards.map(cardLabel).join(" ");

/** best blackjack total: aces count 11, then drop to 1 while busting */
export function handValue(cards: Card[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 1) {
      aces += 1;
      total += 11;
    } else total += Math.min(10, c.rank);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

/** the dealer draws until 17 or more (stands on soft 17); mutates deck and hand */
export function dealerPlay(deck: Card[], hand: Card[]): Card[] {
  while (handValue(hand) < 17 && deck.length) hand.push(deck.pop()!);
  return hand;
}

// ─── roulette: one zero, red/black/odd/even pay 2×, green 14×, a single number 36× ───

const RED_POCKETS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type RouletteBet = {
  kind:
    | "red"
    | "black"
    | "odd"
    | "even"
    | "green"
    | "number"
    | "dozen1"
    | "dozen2"
    | "dozen3"
    | "column1"
    | "column2"
    | "column3"
    | "low"
    | "high";
  number?: number;
};

export function spinRoulette(rng: () => number = Math.random): number {
  return Math.floor(rng() * 37);
}

export function rouletteColor(pocket: number): "red" | "black" | "green" {
  return pocket === 0 ? "green" : RED_POCKETS.has(pocket) ? "red" : "black";
}

/** how many times the bet comes back (0 = lost) */
const inDozen = (pocket: number, dozen: 1 | 2 | 3) => {
  if (pocket === 0) return false;
  if (dozen === 1) return pocket >= 1 && pocket <= 12;
  if (dozen === 2) return pocket >= 13 && pocket <= 24;
  return pocket >= 25 && pocket <= 36;
};

const inColumn = (pocket: number, column: 1 | 2 | 3) => {
  if (pocket === 0) return false;
  return pocket % 3 === (column === 3 ? 0 : column);
};

export function rouletteMultiplier(bet: RouletteBet, pocket: number): number {
  const color = rouletteColor(pocket);
  switch (bet.kind) {
    case "red":
      return color === "red" ? 2 : 0;
    case "black":
      return color === "black" ? 2 : 0;
    case "odd":
      return pocket !== 0 && pocket % 2 === 1 ? 2 : 0;
    case "even":
      return pocket !== 0 && pocket % 2 === 0 ? 2 : 0;
    case "green":
      return pocket === 0 ? 14 : 0;
    case "number":
      return bet.number === pocket ? 36 : 0;
    case "dozen1":
      return inDozen(pocket, 1) ? 3 : 0;
    case "dozen2":
      return inDozen(pocket, 2) ? 3 : 0;
    case "dozen3":
      return inDozen(pocket, 3) ? 3 : 0;
    case "column1":
      return inColumn(pocket, 1) ? 3 : 0;
    case "column2":
      return inColumn(pocket, 2) ? 3 : 0;
    case "column3":
      return inColumn(pocket, 3) ? 3 : 0;
    case "low":
      return pocket >= 1 && pocket <= 18 ? 2 : 0;
    case "high":
      return pocket >= 19 && pocket <= 36 ? 2 : 0;
  }
}
