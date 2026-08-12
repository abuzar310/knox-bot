import { createDb } from "@knox/db";

const globalForDb = globalThis as unknown as {
  knoxDb?: ReturnType<typeof createDb>;
};

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  if (!globalForDb.knoxDb) {
    globalForDb.knoxDb = createDb(url);
  }
  return globalForDb.knoxDb;
}
