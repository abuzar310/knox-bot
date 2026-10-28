import { eq } from "drizzle-orm";
import { DEFAULT_FEATURE_CONFIG, guildSettings, type KnoxDb } from "@knox/db";

export type EconomyCaps = { maxWallet: number; maxBank: number };

const cache = new Map<string, { caps: EconomyCaps; at: number }>();
const TTL_MS = 45_000;

export function invalidateEconomyCaps(guildId: string) {
  cache.delete(guildId);
}

/** UnbelievaBoat max-cash / max-bank (0 = unlimited). Cached briefly to avoid extra reads on chat money. */
export async function getEconomyCaps(db: KnoxDb, guildId: string): Promise<EconomyCaps> {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.caps;
  const [row] = await db
    .select({ features: guildSettings.features })
    .from(guildSettings)
    .where(eq(guildSettings.guildId, guildId))
    .limit(1);
  const f = row?.features ?? DEFAULT_FEATURE_CONFIG;
  const caps = {
    maxWallet: f.maxWalletBalance > 0 ? f.maxWalletBalance : 0,
    maxBank: f.maxBankBalance > 0 ? f.maxBankBalance : 0,
  };
  cache.set(guildId, { caps, at: Date.now() });
  return caps;
}
