import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export function createDb(connectionString: string) {
  const pool = postgres(connectionString, { max: 10 });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export type KnoxDb = ReturnType<typeof createDb>["db"];
export type KnoxPool = ReturnType<typeof createDb>["pool"];

export async function notifyGuildConfig(
  pool: KnoxPool,
  guildId: string,
): Promise<void> {
  await poolUnsafeNotify(pool, guildId);
}

async function poolUnsafeNotify(pool: KnoxPool, guildId: string) {
  // postgres.js supports unsafe for NOTIFY payload
  await pool`select pg_notify('knox_guild_config', ${guildId})`;
}
