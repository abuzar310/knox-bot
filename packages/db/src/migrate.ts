import { applyMigrations } from "./migrator.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

await applyMigrations(connectionString);
console.log("Knox migrations applied");
