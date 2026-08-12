import { and, eq } from "drizzle-orm";
import { memberProfiles, type KnoxDb } from "@knox/db";

export function levelFromXp(xp: number) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100));
}

export function xpForLevel(level: number) {
  return level * level * 100;
}

export async function getProfile(db: KnoxDb, guildId: string, userId: string) {
  const [row] = await db
    .select()
    .from(memberProfiles)
    .where(and(eq(memberProfiles.guildId, guildId), eq(memberProfiles.userId, userId)))
    .limit(1);
  if (row) return row;
  await db
    .insert(memberProfiles)
    .values({ guildId, userId })
    .onConflictDoNothing({ target: [memberProfiles.guildId, memberProfiles.userId] });
  const [created] = await db
    .select()
    .from(memberProfiles)
    .where(and(eq(memberProfiles.guildId, guildId), eq(memberProfiles.userId, userId)))
    .limit(1);
  return created!;
}
