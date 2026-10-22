// Who is AFK, per guild, in memory: checked on every message without touching the database. Filled from the
// database the first time a guild is seen, then kept current by /afk and the welcome-back handler.
import { and, eq, isNotNull } from "drizzle-orm";
import { memberProfiles } from "@knox/db";
import type { KnoxClient } from "../client.js";

export async function afkUsers(client: KnoxClient, guildId: string): Promise<Set<string>> {
  const hit = client.afk.get(guildId);
  if (hit) return hit;
  const set = new Set<string>();
  client.afk.set(guildId, set); // registered first, so a burst of messages triggers one load, not many
  try {
    const rows = await client.db
      .select({ userId: memberProfiles.userId })
      .from(memberProfiles)
      .where(and(eq(memberProfiles.guildId, guildId), isNotNull(memberProfiles.afkReason)));
    for (const row of rows) set.add(row.userId);
  } catch {
    client.afk.delete(guildId); // try again next message
  }
  return set;
}

export async function markAfk(client: KnoxClient, guildId: string, userId: string, afk: boolean) {
  const set = await afkUsers(client, guildId);
  if (afk) set.add(userId);
  else set.delete(userId);
}
