import type { KnoxPool } from "@knox/db";
import { logger } from "../logger.js";
import type { GuildConfigCache } from "./guild-cache.js";

export async function startGuildConfigListener(
  pool: KnoxPool,
  cache: GuildConfigCache,
) {
  await pool.listen("knox_guild_config", (payload) => {
    if (!payload) return;
    cache.invalidate(payload);
    logger.info({ guildId: payload }, "guild config invalidated");
  });
}
