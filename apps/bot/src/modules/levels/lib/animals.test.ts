import { describe, expect, it } from "vitest";
import { ANIMAL_TYPES, isAnimalType, performance, pickAnimal, type Animal } from "./animals.js";

const fixedRng = () => 0; // drop the random term so scores are deterministic

describe("animal performance", () => {
  it("a well-fed, healthy animal beats a weak one of the same type", () => {
    const strong = performance({ type: "horse", age: 15, health: 100, energy: 100, experience: 500 }, fixedRng);
    const weak = performance({ type: "horse", age: 1, health: 20, energy: 10, experience: 0 }, fixedRng);
    expect(strong).toBeGreaterThan(weak);
  });

  it("is strongest in the middle of life", () => {
    const base = { type: "greyhound", health: 80, energy: 80, experience: 100 } as const;
    const mid = performance({ ...base, age: 12 }, fixedRng); // lifespan 25 → peak ~12.5
    const young = performance({ ...base, age: 0 }, fixedRng);
    const old = performance({ ...base, age: 24 }, fixedRng);
    expect(mid).toBeGreaterThan(young);
    expect(mid).toBeGreaterThan(old);
  });

  it("a faster species outruns a slower one when otherwise equal", () => {
    const stats = { age: 5, health: 80, energy: 80, experience: 100 };
    expect(performance({ ...stats, type: "horse" }, fixedRng)).toBeGreaterThan(performance({ ...stats, type: "snail" }, fixedRng));
  });
});

describe("isAnimalType", () => {
  it("accepts the four types and rejects anything else", () => {
    expect(isAnimalType("horse")).toBe(true);
    expect(isAnimalType("snail")).toBe(true);
    expect(isAnimalType("dragon")).toBe(false);
    expect(isAnimalType("toString")).toBe(false);
  });
});

describe("pickAnimal", () => {
  const mk = (id: number, type: string, nickname: string | null): Animal =>
    ({ id, guildId: "g", userId: "u", type, nickname, age: 0, health: 80, energy: 80, experience: 0, createdAt: new Date() } as Animal);
  const list = [mk(1, "horse", "Thunder"), mk(2, "snail", null), mk(3, "horse", "Lightning")];

  it("finds by exact nickname, then type, then partial, and defaults to the first", () => {
    expect(pickAnimal(list, "thunder")?.id).toBe(1);
    expect(pickAnimal(list, "snail")?.id).toBe(2);
    expect(pickAnimal(list, "light")?.id).toBe(3);
    expect(pickAnimal(list, null)?.id).toBe(1);
    expect(pickAnimal([], "x")).toBeNull();
  });
});

describe("prices", () => {
  it("get pricier from snail to horse", () => {
    expect(ANIMAL_TYPES.snail.price).toBeLessThan(ANIMAL_TYPES.pigeon.price);
    expect(ANIMAL_TYPES.pigeon.price).toBeLessThan(ANIMAL_TYPES.greyhound.price);
    expect(ANIMAL_TYPES.greyhound.price).toBeLessThan(ANIMAL_TYPES.horse.price);
  });
});
