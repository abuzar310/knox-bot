// Only one ZARU may be logged in at a time: two copies with the same token answer every command twice. Every copy
// shares the database, so a session-level advisory lock on one reserved connection is the referee. A copy that finds
// the lock taken waits (logging who holds it) instead of logging in to Discord.
import { hostname } from "node:os";
import type { KnoxPool } from "@knox/db";
import { logger } from "../logger.js";

const CLASS_ID = 731;
const OBJ_ID = 1;
const RETRY_MS = 30_000;

export type InstanceLock = { holder: string; release: () => Promise<void> };

type Holder = { application_name: string | null; addr: string | null; backend_start: string | null };

export async function acquireInstanceLock(pool: KnoxPool): Promise<InstanceLock> {
  const holder = `zaru@${hostname()}#${process.pid}`;
  let reserved: Awaited<ReturnType<KnoxPool["reserve"]>>;
  try {
    reserved = await pool.reserve();
    await reserved.unsafe(`set application_name = '${holder.replace(/[^a-zA-Z0-9@#._-]/g, "")}'`);
  } catch (err) {
    // no database, no referee: better one bot than none
    logger.warn({ err }, "instance lock unavailable; starting without it");
    return { holder, release: async () => undefined };
  }
  for (let attempt = 1; ; attempt++) {
    const rows = (await reserved.unsafe(`select pg_try_advisory_lock(${CLASS_ID}, ${OBJ_ID}) as ok`)) as unknown as Array<{ ok: boolean }>;
    if (rows[0]?.ok) {
      logger.info({ holder, attempt }, "instance lock held");
      return {
        holder,
        release: async () => {
          await reserved.unsafe(`select pg_advisory_unlock(${CLASS_ID}, ${OBJ_ID})`).catch(() => undefined);
          reserved.release();
        },
      };
    }
    const holders = (await reserved
      .unsafe(
        `select a.application_name, a.client_addr::text as addr, a.backend_start::text as backend_start
         from pg_locks l join pg_stat_activity a on a.pid = l.pid
         where l.locktype = 'advisory' and l.classid = ${CLASS_ID} and l.objid = ${OBJ_ID} and l.granted`,
      )
      .catch(() => [])) as unknown as Holder[];
    logger.warn({ attempt, holders }, `another ZARU is already running with this database; waiting ${RETRY_MS / 1000} s before trying again`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
  }
}
