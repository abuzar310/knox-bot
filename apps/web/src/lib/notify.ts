import { notifyGuildConfig } from "@knox/db";
import { getDb } from "./db";

export async function bumpGuildConfig(guildId: string) {
  const { pool } = getDb();
  await notifyGuildConfig(pool, guildId);
}
