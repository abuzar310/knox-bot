// UnbelievaBoat-style animal racing. You buy an animal (snail/pigeon/greyhound/horse), feed it its own provisions to
// keep its energy up, and enter it in races against same-type rivals. An animal is strongest in the middle of its
// life, wins get easier with experience, and once it ages past its lifespan it retires. Exact UnbelievaBoat prices
// and race maths aren't public, so these are a faithful reconstruction.
import { and, eq, sql } from "drizzle-orm";
import { animals, type KnoxDb } from "@knox/db";
import { getProfile } from "../../../lib/profiles.js";
import { takeWallet } from "../../../lib/xp.js";

export const ANIMAL_TYPES = {
  snail: { label: "Snail", emoji: "🐌", price: 300, base: 20, lifespan: 15 },
  pigeon: { label: "Pigeon", emoji: "🐦", price: 800, base: 40, lifespan: 20 },
  greyhound: { label: "Greyhound", emoji: "🐕", price: 2000, base: 65, lifespan: 25 },
  horse: { label: "Horse", emoji: "🐎", price: 5000, base: 85, lifespan: 30 },
} as const;
export type AnimalType = keyof typeof ANIMAL_TYPES;
export const ANIMAL_ORDER: AnimalType[] = ["snail", "pigeon", "greyhound", "horse"];
export function isAnimalType(s: string): s is AnimalType {
  return Object.prototype.hasOwnProperty.call(ANIMAL_TYPES, s);
}

/** each animal type eats only its own food; feeding refills energy */
export const PROVISIONS: Record<AnimalType, { name: string; emoji: string; price: number; energy: number }> = {
  snail: { name: "leaves", emoji: "🍃", price: 40, energy: 30 },
  pigeon: { name: "seeds", emoji: "🌾", price: 80, energy: 30 },
  greyhound: { name: "kibble", emoji: "🦴", price: 150, energy: 30 },
  horse: { name: "hay", emoji: "🌾", price: 300, energy: 30 },
};

export const MAX_ANIMALS = 10;

export type AnimalStats = { type: AnimalType; age: number; health: number; energy: number; experience: number };

/** a race performance score; higher finishes ahead. Pure, with rng injected so it can be tested */
export function performance(a: AnimalStats, rng: () => number = Math.random): number {
  const t = ANIMAL_TYPES[a.type];
  const peak = t.lifespan / 2;
  const ageFactor = Math.max(0.4, 1 - Math.abs(a.age - peak) / t.lifespan); // best in the middle of life
  const energyF = 0.5 + 0.5 * (a.energy / 100);
  const healthF = 0.6 + 0.4 * (a.health / 100);
  const expF = 1 + Math.min(0.3, a.experience / 1000);
  return t.base * energyF * healthF * ageFactor * expF + rng() * 20;
}

/** a random same-type rival to fill out the field */
export function botOpponent(type: AnimalType, rng: () => number = Math.random): AnimalStats {
  const t = ANIMAL_TYPES[type];
  return {
    type,
    age: Math.floor(rng() * t.lifespan),
    health: 50 + Math.floor(rng() * 50),
    energy: 50 + Math.floor(rng() * 50),
    experience: Math.floor(rng() * 300),
  };
}

export type Animal = typeof animals.$inferSelect;

export async function listAnimals(db: KnoxDb, guildId: string, userId: string): Promise<Animal[]> {
  return db.select().from(animals).where(and(eq(animals.guildId, guildId), eq(animals.userId, userId)));
}

/** pick one owned animal by exact nickname, then type, then partial nickname; the first owned one with no query */
export function pickAnimal(list: Animal[], query: string | null): Animal | null {
  if (!list.length) return null;
  if (!query) return list[0] ?? null;
  const q = query.trim().toLowerCase();
  const exact = list.find((a) => (a.nickname ?? "").toLowerCase() === q);
  if (exact) return exact;
  if (isAnimalType(q)) return list.find((a) => a.type === q) ?? null;
  return list.find((a) => (a.nickname ?? "").toLowerCase().includes(q)) ?? null;
}

export type BuyResult = { ok: true; animal: Animal } | { ok: false; reason: "broke" | "full" };

export async function buyAnimal(db: KnoxDb, guildId: string, userId: string, type: AnimalType, nickname: string | null): Promise<BuyResult> {
  await getProfile(db, guildId, userId);
  const owned = await listAnimals(db, guildId, userId);
  if (owned.length >= MAX_ANIMALS) return { ok: false, reason: "full" };
  const paid = await takeWallet(db, guildId, userId, ANIMAL_TYPES[type].price);
  if (!paid) return { ok: false, reason: "broke" };
  const [row] = await db
    .insert(animals)
    .values({ guildId, userId, type, nickname: nickname?.slice(0, 32) || null })
    .returning();
  return { ok: true, animal: row! };
}

/** feed an animal its provision: +energy and a little health (capped at 100); charges the food price */
export async function feedAnimal(db: KnoxDb, guildId: string, userId: string, animal: Animal): Promise<{ energy: number; health: number } | "broke"> {
  const prov = PROVISIONS[animal.type as AnimalType];
  const paid = await takeWallet(db, guildId, userId, prov.price);
  if (!paid) return "broke";
  const [row] = await db
    .update(animals)
    .set({ energy: sql`least(100, ${animals.energy} + ${prov.energy})`, health: sql`least(100, ${animals.health} + 5)` })
    .where(eq(animals.id, animal.id))
    .returning({ energy: animals.energy, health: animals.health });
  return { energy: row?.energy ?? animal.energy, health: row?.health ?? animal.health };
}

/** wear from a race: age +1, energy -15, health -3, experience up; retires (deletes) once it ages past its lifespan */
export async function applyRace(db: KnoxDb, animal: Animal, won: boolean): Promise<{ retired: boolean }> {
  const t = ANIMAL_TYPES[animal.type as AnimalType];
  if (animal.age + 1 > t.lifespan) {
    await db.delete(animals).where(eq(animals.id, animal.id));
    return { retired: true };
  }
  await db
    .update(animals)
    .set({
      age: animal.age + 1,
      energy: sql`greatest(0, ${animals.energy} - 15)`,
      health: sql`greatest(0, ${animals.health} - 3)`,
      experience: sql`${animals.experience} + ${won ? 30 : 10}`,
    })
    .where(eq(animals.id, animal.id));
  return { retired: false };
}
