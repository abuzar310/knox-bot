/**
 * Close #chat until 18+ or 18- is picked, and keep current members talking.
 * Run: pnpm --filter @knox/bot exec tsx scripts/install-gates.ts <guildId>
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installChatGate } from "../src/modules/community/lib/chat-gate.js";

const guildId = process.argv[2];
const memberRoleId = process.argv[3];
if (!guildId || !memberRoleId) {
  console.error("usage: tsx scripts/install-gates.ts <guildId> <memberRoleId>");
  process.exit(1);
}

function envFile(): Record<string, string> {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../.env");
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const index = line.indexOf("=");
    if (index <= 0 || line.startsWith("#")) continue;
    out[line.slice(0, index)] = line.slice(index + 1).trim().replace(/^"|"$/g, "");
  }
  return out;
}

const env = envFile();
const token = process.env.DISCORD_TOKEN || env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN is required");
  process.exit(1);
}

const lines = await installChatGate(token, guildId, memberRoleId);
for (const line of lines) console.log(line);
