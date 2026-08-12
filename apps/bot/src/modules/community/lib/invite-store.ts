import { count, desc, eq, and, sql } from "drizzle-orm";
import { inviteJoins, type KnoxDb } from "@knox/db";

export async function recordJoin(
  db: KnoxDb,
  input: {
    guildId: string;
    memberId: string;
    inviterId: string | null;
    code: string | null;
  },
) {
  await db
    .insert(inviteJoins)
    .values(input)
    .onConflictDoUpdate({
      target: [inviteJoins.guildId, inviteJoins.memberId],
      set: {
        inviterId: input.inviterId,
        code: input.code,
        createdAt: new Date(),
      },
    });
}

export async function countInvites(
  db: KnoxDb,
  guildId: string,
  inviterId: string,
) {
  const [row] = await db
    .select({ n: count() })
    .from(inviteJoins)
    .where(
      and(eq(inviteJoins.guildId, guildId), eq(inviteJoins.inviterId, inviterId)),
    );
  return Number(row?.n ?? 0);
}

export async function topInviters(db: KnoxDb, guildId: string, limit = 10) {
  return db
    .select({
      inviterId: inviteJoins.inviterId,
      n: sql<number>`count(*)::int`,
    })
    .from(inviteJoins)
    .where(eq(inviteJoins.guildId, guildId))
    .groupBy(inviteJoins.inviterId)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
}
