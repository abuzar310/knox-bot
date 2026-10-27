// Chicken fight — UnbelievaBoat's "cock-fight". You buy a chicken, then bet it in fights. Its STRENGTH is its win
// chance in percent. A win pays the bet and raises strength by 1; a loss takes the bet and the chicken dies, so you
// have to buy another. Every money move is one conditional UPDATE so a double tap can't buy two or fight twice.
import { and, eq, isNull } from "drizzle-orm";
import { memberProfiles, type KnoxDb } from "@knox/db";
import { getProfile } from "../../../lib/profiles.js";
import { addWallet, takeWallet } from "../../../lib/xp.js";

const whose = (g: string, u: string) => and(eq(memberProfiles.guildId, g), eq(memberProfiles.userId, u));

/** a fresh chicken's starting strength: a random whole percent in the server's [min, max] range */
export function randomStartStrength(min: number, max: number): number {
  const lo = Math.max(1, Math.min(min, max));
  const hi = Math.min(99, Math.max(min, max));
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export type Chicken = { strength: number | null; wins: number };

export async function getChicken(db: KnoxDb, guildId: string, userId: string): Promise<Chicken> {
  const [row] = await db
    .select({ strength: memberProfiles.chickenStrength, wins: memberProfiles.chickenWins })
    .from(memberProfiles)
    .where(whose(guildId, userId))
    .limit(1);
  return { strength: row?.strength ?? null, wins: row?.wins ?? 0 };
}

export type BuyResult = "ok" | "has" | "broke";

/** buy a chicken: claims the slot only when there's no living chicken, then charges; refunds the claim if too poor */
export async function buyChicken(db: KnoxDb, guildId: string, userId: string, price: number, start: number): Promise<BuyResult> {
  await getProfile(db, guildId, userId);
  const claimed = await db
    .update(memberProfiles)
    .set({ chickenStrength: start, chickenWins: 0 })
    .where(and(whose(guildId, userId), isNull(memberProfiles.chickenStrength)))
    .returning({ s: memberProfiles.chickenStrength });
  if (!claimed.length) return "has";
  const paid = await takeWallet(db, guildId, userId, price);
  if (!paid) {
    await db.update(memberProfiles).set({ chickenStrength: null, chickenWins: 0 }).where(whose(guildId, userId));
    return "broke";
  }
  return "ok";
}

export type FightResult =
  | { result: "nochicken" }
  | { result: "broke" }
  | { result: "win"; strength: number; wins: number; wallet: number }
  | { result: "loss"; strength: number; wins: number; wallet: number };

/** fight the chicken for `bet`: win → +bet and strength +1; loss → -bet and the chicken dies */
export async function fightChicken(db: KnoxDb, guildId: string, userId: string, bet: number): Promise<FightResult> {
  await getProfile(db, guildId, userId);
  const { strength, wins } = await getChicken(db, guildId, userId);
  if (strength === null) return { result: "nochicken" };
  const paid = await takeWallet(db, guildId, userId, bet);
  if (!paid) return { result: "broke" };
  const won = Math.floor(Math.random() * 100) + 1 <= strength;
  if (won) {
    const newStrength = Math.min(99, strength + 1);
    const newWins = wins + 1;
    await db.update(memberProfiles).set({ chickenStrength: newStrength, chickenWins: newWins }).where(whose(guildId, userId));
    const wallet = await addWallet(db, guildId, userId, bet * 2);
    return { result: "win", strength: newStrength, wins: newWins, wallet };
  }
  // lost: the chicken dies, win streak resets
  await db.update(memberProfiles).set({ chickenStrength: null, chickenWins: 0 }).where(whose(guildId, userId));
  const wallet = await addWallet(db, guildId, userId, 0);
  return { result: "loss", strength, wins, wallet };
}
