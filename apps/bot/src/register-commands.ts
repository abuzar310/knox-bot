import path from "node:path";
import { fileURLToPath } from "node:url";
import { REST, Routes } from "discord.js";
import { loadEnv } from "./env.js";
import { loadModules } from "./load/modules.js";
import { logger } from "./logger.js";
import { publishApplicationProfile } from "./lib/about.js";

const env = loadEnv();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modulesDir = path.join(__dirname, "modules");

const modules = await loadModules(modulesDir);
const live = modules.filter((m) => m.commands.length > 0);
const body = live.flatMap((m) => m.commands.map((c) => c.data.toJSON()));

const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);
await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body });
logger.info({ count: body.length }, "registered global slash commands");
await publishApplicationProfile(rest);
