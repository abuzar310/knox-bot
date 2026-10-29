/**
 * Post rules, an announcement, and the self-role menus as ZARU.
 * Run: pnpm --filter @knox/bot exec tsx scripts/install-boards.ts <guildId>
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installServerBoards } from "../src/modules/community/lib/install-boards.js";

const guildId = process.argv[2];
if (!guildId) {
  console.error("usage: tsx scripts/install-boards.ts <guildId>");
  process.exit(1);
}

function tokenFromEnvFile(): string {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.env");
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.startsWith("DISCORD_TOKEN=")) return line.slice("DISCORD_TOKEN=".length).trim().replace(/^"|"$/g, "");
  }
  return "";
}

const token = process.env.DISCORD_TOKEN || tokenFromEnvFile();
if (!token) {
  console.error("DISCORD_TOKEN is missing");
  process.exit(1);
}

const { lines } = await installServerBoards(token, guildId);
for (const line of lines) console.log(line);
