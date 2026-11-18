import { applyMigrations } from "./migrator.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

// This runs before the dashboard starts on its host. A run that hangs (a stalled connection, a lock held somewhere
// else) once held a deploy for 17 minutes until the host gave up on it. A real run takes seconds, so one that is
// still going after three minutes stops with an error, and the host starts it again.
const LIMIT_MS = 180_000;
const giveUp = setTimeout(() => {
  console.error(`Knox migrations did not finish in ${LIMIT_MS / 1000} s; stopping so the start can be tried again`);
  process.exit(1);
}, LIMIT_MS);

await applyMigrations(connectionString);
clearTimeout(giveUp);
console.log("Knox migrations applied");
