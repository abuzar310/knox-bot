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
  // case numbers are max+1 under a unique index, so two moderators acting at the same moment collide: retry
  for (let attempt = 0; ; attempt++) {
    const caseNumber = await nextCaseNumber(db, input.guildId);
    try {
      const [created] = await db
        .insert(modCases)
        .values({
          guildId: input.guildId,
          caseNumber,
          type: input.type,
          targetId: input.targetId,
          moderatorId: input.moderatorId,
          reason: (input.reason || "No reason provided").slice(0, 1000),
          durationMs: input.durationMs ?? null,
          active: input.active ?? true,
        })
        .returning();
      return created;
    } catch (error) {
      if ((error as { code?: string }).code !== "23505" || attempt >= 5) throw error;
    }
  }
}

/**
 * A case for an action seen in Discord's audit log, made once per entry: null when that entry already has its
 * case (a replayed event, a second process, a restart in between).
 */
export async function createAuditCase(
  db: KnoxDb,
  input: {
    guildId: string;
    type: ModCaseType;
    targetId: string;
    moderatorId: string;
    reason: string;
    durationMs: number | null;
    active: boolean;
    auditEntryId: string;
  },
) {
  for (let attempt = 0; ; attempt++) {
    const [seen] = await db
      .select({ id: modCases.id })
      .from(modCases)
      .where(and(eq(modCases.guildId, input.guildId), eq(modCases.auditEntryId, input.auditEntryId)))
      .limit(1);
    if (seen) return null;
    const caseNumber = await nextCaseNumber(db, input.guildId);
    try {
      const [created] = await db
        .insert(modCases)
        .values({
          guildId: input.guildId,
          caseNumber,
          type: input.type,
          targetId: input.targetId,
          moderatorId: input.moderatorId,
          reason: (input.reason || "No reason provided").slice(0, 1000),
          durationMs: input.durationMs,
          active: input.active,
          source: "audit",
          auditEntryId: input.auditEntryId,
        })
        .returning();
      return created ?? null;
    } catch (error) {
      // a clash on the case number retries; a clash on the entry is caught by the look-up at the top of the next turn
      if ((error as { code?: string }).code !== "23505" || attempt >= 5) throw error;
    }
  }
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

/** a ban that was lifted is no longer in force */
export async function deactivateActiveBans(db: KnoxDb, guildId: string, targetId: string) {
  await db
    .update(modCases)
    .set({ active: false })
    .where(and(eq(modCases.guildId, guildId), eq(modCases.targetId, targetId), eq(modCases.type, "ban"), eq(modCases.active, true)));
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
