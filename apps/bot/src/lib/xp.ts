import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { memberProfiles, type KnoxDb } from "@knox/db";
import { getProfile, levelFromXp } from "./profiles.js";

// Every change here is one UPDATE with its condition inside, so two messages, two taps or two commands at the
// same moment can't both count (the old read-then-write let coins be duplicated and cooldowns be skipped).

const whoseRow = (guildId: string, userId: string) =>
  and(eq(memberProfiles.guildId, guildId), eq(memberProfiles.userId, userId));

export async function addXp(
  db: KnoxDb,
  guildId: string,
  userId: string,
  amount: number,
  cooldownSec: number,
) {
  const profile = await getProfile(db, guildId, userId);
  const cutoff = new Date(Date.now() - cooldownSec * 1000);
  const [row] = await db
    .update(memberProfiles)
    .set({ xp: sql`${memberProfiles.xp} + ${amount}`, lastXpAt: new Date() })
    .where(and(whoseRow(guildId, userId), or(isNull(memberProfiles.lastXpAt), lt(memberProfiles.lastXpAt, cutoff))))
    .returning({ xp: memberProfiles.xp, level: memberProfiles.level });
  if (!row) return { ...profile, leveled: false as const, gained: 0 };
  const level = levelFromXp(row.xp);
  const leveled = level > row.level;
  if (leveled) {
    await db
      .update(memberProfiles)
      .set({ level })
      .where(and(whoseRow(guildId, userId), lt(memberProfiles.level, level)));
  }
  return { ...profile, xp: row.xp, level, leveled, gained: amount };
}

/** adds coins (a negative amount takes them); the wallet never goes below zero */
export async function addWallet(db: KnoxDb, guildId: string, userId: string, amount: number) {
  await getProfile(db, guildId, userId);
  const [row] = await db
    .update(memberProfiles)
    .set({ wallet: sql`greatest(0, ${memberProfiles.wallet} + ${amount})` })
    .where(whoseRow(guildId, userId))
    .returning({ wallet: memberProfiles.wallet });
  return row?.wallet ?? 0;
}

/** takes coins only if they are all there: true when taken, false when the wallet was short (nothing changes) */
export async function takeWallet(db: KnoxDb, guildId: string, userId: string, amount: number): Promise<boolean> {
  if (!Number.isInteger(amount) || amount <= 0) return false;
  await getProfile(db, guildId, userId);
  const rows = await db
    .update(memberProfiles)
    .set({ wallet: sql`${memberProfiles.wallet} - ${amount}` })
    .where(and(whoseRow(guildId, userId), gte(memberProfiles.wallet, amount)))
    .returning({ wallet: memberProfiles.wallet });
  return rows.length > 0;
}

/** a timed payout (daily, work): paid only when the last claim is older than `minHours`; null when too soon */
export async function claimTimed(
  db: KnoxDb,
  guildId: string,
  userId: string,
  field: "lastDailyAt" | "lastWorkAt",
  minHours: number,
  amount: number,
): Promise<number | null> {
  await getProfile(db, guildId, userId);
  const column = field === "lastDailyAt" ? memberProfiles.lastDailyAt : memberProfiles.lastWorkAt;
  const stamp = field === "lastDailyAt" ? { lastDailyAt: new Date() } : { lastWorkAt: new Date() };
  const cutoff = new Date(Date.now() - minHours * 3_600_000);
  const [row] = await db
    .update(memberProfiles)
    .set({ wallet: sql`${memberProfiles.wallet} + ${amount}`, ...stamp })
    .where(and(whoseRow(guildId, userId), or(isNull(column), lt(column, cutoff))))
    .returning({ wallet: memberProfiles.wallet });
  return row ? row.wallet : null;
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
