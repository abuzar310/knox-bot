import { and, desc, eq } from "drizzle-orm";
import { memberProfiles, type KnoxDb } from "@knox/db";
import { getProfile, levelFromXp } from "./profiles.js";

export async function addXp(
  db: KnoxDb,
  guildId: string,
  userId: string,
  amount: number,
  cooldownSec: number,
) {
  const profile = await getProfile(db, guildId, userId);
  const now = Date.now();
  if (profile.lastXpAt && now - profile.lastXpAt.getTime() < cooldownSec * 1000) {
    return { ...profile, leveled: false as const, gained: 0 };
  }
  const xp = profile.xp + amount;
  const level = levelFromXp(xp);
  const leveled = level > profile.level;
  await db
    .update(memberProfiles)
    .set({ xp, level, lastXpAt: new Date() })
    .where(and(eq(memberProfiles.guildId, guildId), eq(memberProfiles.userId, userId)));
  return { ...profile, xp, level, leveled, gained: amount };
}

export async function addWallet(db: KnoxDb, guildId: string, userId: string, amount: number) {
  const profile = await getProfile(db, guildId, userId);
  const wallet = Math.max(0, profile.wallet + amount);
  await db
    .update(memberProfiles)
    .set({ wallet })
    .where(and(eq(memberProfiles.guildId, guildId), eq(memberProfiles.userId, userId)));
  return wallet;
}

export async function topXp(db: KnoxDb, guildId: string, limit = 10) {
  return db
    .select()
    .from(memberProfiles)
    .where(eq(memberProfiles.guildId, guildId))
    .orderBy(desc(memberProfiles.xp))
    .limit(limit);
}

export async function topWallet(db: KnoxDb, guildId: string, limit = 10) {
  return db
    .select()
    .from(memberProfiles)
    .where(eq(memberProfiles.guildId, guildId))
    .orderBy(desc(memberProfiles.wallet))
    .limit(limit);
}
