import { desc, eq, and, sql } from "drizzle-orm";
import { modCases, type KnoxDb } from "@knox/db";

export type ModCaseType =
  | "warn"
  | "mute"
  | "unmute"
  | "kick"
  | "ban"
  | "unban";

export async function nextCaseNumber(db: KnoxDb, guildId: string) {
  const [row] = await db
    .select({
      max: sql<number>`coalesce(max(${modCases.caseNumber}), 0)`,
    })
    .from(modCases)
    .where(eq(modCases.guildId, guildId));
  return Number(row?.max ?? 0) + 1;
}

export async function createCase(
  db: KnoxDb,
  input: {
    guildId: string;
    type: ModCaseType;
    targetId: string;
    moderatorId: string;
    reason: string;
    durationMs?: number | null;
    active?: boolean;
  },
) {
  const caseNumber = await nextCaseNumber(db, input.guildId);
  const [created] = await db
    .insert(modCases)
    .values({
      guildId: input.guildId,
      caseNumber,
      type: input.type,
      targetId: input.targetId,
      moderatorId: input.moderatorId,
      reason: input.reason || "No reason provided",
      durationMs: input.durationMs ?? null,
      active: input.active ?? true,
    })
    .returning();
  return created;
}

export async function getCase(db: KnoxDb, guildId: string, caseNumber: number) {
  const [row] = await db
    .select()
    .from(modCases)
    .where(
      and(eq(modCases.guildId, guildId), eq(modCases.caseNumber, caseNumber)),
    )
    .limit(1);
  return row ?? null;
}

export async function getUserHistory(
  db: KnoxDb,
  guildId: string,
  targetId: string,
  limit = 10,
) {
  return db
    .select()
    .from(modCases)
    .where(and(eq(modCases.guildId, guildId), eq(modCases.targetId, targetId)))
    .orderBy(desc(modCases.createdAt))
    .limit(limit);
}

export async function deactivateActiveMutes(
  db: KnoxDb,
  guildId: string,
  targetId: string,
) {
  await db
    .update(modCases)
    .set({ active: false })
    .where(
      and(
        eq(modCases.guildId, guildId),
        eq(modCases.targetId, targetId),
        eq(modCases.type, "mute"),
        eq(modCases.active, true),
      ),
    );
}
