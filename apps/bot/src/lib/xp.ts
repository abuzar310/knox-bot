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
  applyBoost = false,
) {
  const profile = await getProfile(db, guildId, userId);
  // a bought XP boost multiplies earned XP while it lasts (uses the profile already fetched, so no extra read)
  if (applyBoost && profile.xpBoostUntil && new Date(profile.xpBoostUntil) > new Date() && profile.xpBoostPercent > 0) {
    amount = Math.round(amount * (1 + profile.xpBoostPercent / 100));
  }
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

/** turn on a rob shield for a number of hours (used by /shop use) */
export async function activateRobShield(db: KnoxDb, guildId: string, userId: string, hours: number) {
  await getProfile(db, guildId, userId);
  await db
    .update(memberProfiles)
    .set({ robShieldUntil: new Date(Date.now() + hours * 3_600_000) })
    .where(whoseRow(guildId, userId));
}

/** turn on an XP boost of a percent for a number of hours (used by /shop use) */
export async function activateXpBoost(db: KnoxDb, guildId: string, userId: string, percent: number, hours: number) {
  await getProfile(db, guildId, userId);
  await db
    .update(memberProfiles)
    .set({ xpBoostUntil: new Date(Date.now() + hours * 3_600_000), xpBoostPercent: percent })
    .where(whoseRow(guildId, userId));
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

const COOLDOWN_COLS = {
  lastFishAt: memberProfiles.lastFishAt,
  lastHuntAt: memberProfiles.lastHuntAt,
  lastCrimeAt: memberProfiles.lastCrimeAt,
  lastRobAt: memberProfiles.lastRobAt,
  lastCollectAt: memberProfiles.lastCollectAt,
} as const;
export type CooldownField = keyof typeof COOLDOWN_COLS;

/** stamps the cooldown and says go — or false when it hasn't passed yet (nothing changes) */
export async function tryCooldown(db: KnoxDb, guildId: string, userId: string, field: CooldownField, minMinutes: number): Promise<boolean> {
  await getProfile(db, guildId, userId);
  const column = COOLDOWN_COLS[field];
  const cutoff = new Date(Date.now() - minMinutes * 60_000);
  const rows = await db
    .update(memberProfiles)
    .set({ [field]: new Date() })
    .where(and(whoseRow(guildId, userId), or(isNull(column), lt(column, cutoff))))
    .returning({ userId: memberProfiles.userId });
  return rows.length > 0;
}

/** wallet → bank, only when the wallet covers it; returns the new bank or null */
export async function depositCoins(db: KnoxDb, guildId: string, userId: string, amount: number): Promise<number | null> {
  if (!Number.isInteger(amount) || amount <= 0) return null;
  await getProfile(db, guildId, userId);
  const [row] = await db
    .update(memberProfiles)
    .set({ wallet: sql`${memberProfiles.wallet} - ${amount}`, bank: sql`${memberProfiles.bank} + ${amount}` })
    .where(and(whoseRow(guildId, userId), gte(memberProfiles.wallet, amount)))
    .returning({ bank: memberProfiles.bank });
  return row?.bank ?? null;
}

/** bank → wallet, only when the bank covers it; returns the new wallet or null */
export async function withdrawCoins(db: KnoxDb, guildId: string, userId: string, amount: number): Promise<number | null> {
  if (!Number.isInteger(amount) || amount <= 0) return null;
  await getProfile(db, guildId, userId);
  const [row] = await db
    .update(memberProfiles)
    .set({ bank: sql`${memberProfiles.bank} - ${amount}`, wallet: sql`${memberProfiles.wallet} + ${amount}` })
    .where(and(whoseRow(guildId, userId), gte(memberProfiles.bank, amount)))
    .returning({ wallet: memberProfiles.wallet });
  return row?.wallet ?? null;
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
    .orderBy(desc(sql`${memberProfiles.wallet} + ${memberProfiles.bank}`))
    .limit(limit);
}

/** a minute in voice: XP and voice time in one UPDATE; null when the row vanished */
export async function addVoiceMinute(db: KnoxDb, guildId: string, userId: string, xpAmount: number) {
  await getProfile(db, guildId, userId);
  const [row] = await db
    .update(memberProfiles)
    .set({ xp: sql`${memberProfiles.xp} + ${xpAmount}`, voiceSeconds: sql`${memberProfiles.voiceSeconds} + 60` })
    .where(whoseRow(guildId, userId))
    .returning({ xp: memberProfiles.xp, level: memberProfiles.level });
  if (!row) return null;
  const level = levelFromXp(row.xp);
  const leveled = level > row.level;
  if (leveled) {
    await db
      .update(memberProfiles)
      .set({ level })
      .where(and(whoseRow(guildId, userId), lt(memberProfiles.level, level)));
  }
  return { xp: row.xp, level, leveled };
}

export async function topVoice(db: KnoxDb, guildId: string, limit = 10) {
  return db
    .select()
    .from(memberProfiles)
    .where(eq(memberProfiles.guildId, guildId))
    .orderBy(desc(memberProfiles.voiceSeconds))
    .limit(limit);
}
