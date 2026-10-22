import { createHash } from "node:crypto";
import dns from "node:dns";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, setGlobalDispatcher } from "undici";
import { ActivityType, Events } from "discord.js";
import { applyMigrations, createDb, guilds } from "@knox/db";
import { KnoxClient } from "./client.js";
import { loadEnv } from "./env.js";
import { logger } from "./logger.js";
import { loadModules } from "./load/modules.js";
import { registerInteractionRouter } from "./interactions/router.js";
import { GuildConfigCache } from "./config/guild-cache.js";
import { startGuildConfigListener } from "./config/listen.js";
import { startHealthServer } from "./health.js";
import { startKeepAlive } from "./keepalive.js";
import { startJobs } from "./jobs.js";
import { publishApplicationProfile, applyBotDisplayName } from "./lib/about.js";

dns.setDefaultResultOrder("ipv4first");
if (process.env.RENDER) {
  setGlobalDispatcher(
    new Agent({
      connect: {
        lookup(
          hostname: string,
          _options: unknown,
          callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
        ) {
          dns.lookup(hostname, { family: 4 }, callback);
        },
      } as never,
    }),
  );
}

async function upsertGuild(
  client: KnoxClient,
  guild: { id: string; name: string; icon: string | null; ownerId: string },
) {
  await client.db
    .insert(guilds)
    .values({
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      ownerId: guild.ownerId,
    })
    .onConflictDoUpdate({
      target: guilds.id,
      set: {
        name: guild.name,
        icon: guild.icon,
        ownerId: guild.ownerId,
      },
    });
}

const env = loadEnv();
const client = new KnoxClient();
startHealthServer(env.healthPort, () => ({
  ready: client.isReady(),
  wsPing: client.ws.ping,
  voice:
    [...client.guilds.cache.values()]
      .map((guild) => guild.members.me?.voice.channelId)
      .find(Boolean) ?? null,
}));
startKeepAlive();
client.rest.on("rateLimited", (info) => {
  logger.warn(info, "discord rate limited");
});
client.on(Events.Debug, (message) => {
  if (/Heartbeat|heartbeatLatency|Provided token|\[VOICE\]/i.test(message)) return;
  logger.info({ message }, "discord debug");
});
client.on(Events.Error, (error) => {
  logger.warn({ err: error }, "discord client error");
});
client.on(Events.ShardDisconnect, (event, shardId) => {
  logger.warn({ shardId, code: event.code, reason: event.reason }, "shard disconnect");
});
client.on(Events.ShardResume, (shardId) => {
  logger.info({ shardId }, "shard resume");
});
try {
  await Promise.race([
    applyMigrations(env.DATABASE_URL),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("migrate timeout")), 8_000);
    }),
  ]);
  logger.info("database migrations applied");
} catch (error) {
  logger.error({ err: error }, "database migrate failed");
}
const { db, pool } = createDb(env.DATABASE_URL);
client.db = db;
client.pool = pool;
client.guildConfig = new GuildConfigCache(db);

// ---------------------------------------------------------------- process safety
// Ctrl-C, a supervisor's stop, or a crash: leave voice and Discord cleanly, close the database, then exit.
// An uncaught error exits non-zero so the launcher restarts a fresh process instead of limping on.
let stopping = false;
async function shutdown(code: number, why: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ code, why }, "shutting down");
  const hardStop = setTimeout(() => process.exit(code), 8_000);
  hardStop.unref();
  try {
    await client.destroy();
  } catch (error) {
    logger.warn({ err: error }, "discord destroy failed");
  }
  try {
    await (pool as unknown as { end?: (o?: { timeout?: number }) => Promise<void> }).end?.({ timeout: 5 });
  } catch (error) {
    logger.warn({ err: error }, "database close failed");
  }
  process.exit(code);
}
process.on("SIGINT", () => void shutdown(0, "SIGINT"));
process.on("SIGTERM", () => void shutdown(0, "SIGTERM"));
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandled rejection");
});
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "uncaught exception");
  void shutdown(1, "uncaughtException");
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modulesDir = path.join(__dirname, "modules");

logger.info({ modulesDir }, "loading modules");
const modules = await loadModules(modulesDir);
logger.info({ count: modules.length }, "modules loaded");
for (const mod of modules) {
  client.modules.set(mod.id, mod);
  for (const command of mod.commands) {
    client.commands.set(command.data.name, command);
  }
  for (const event of mod.events ?? []) {
    const runner = (...args: unknown[]) => event.execute(...args);
    // discord.js event unions are too wide for dynamic module binding
    const emitter = client as unknown as {
      on: (event: string, listener: (...args: unknown[]) => void) => void;
      once: (event: string, listener: (...args: unknown[]) => void) => void;
    };
    if (event.once) emitter.once(event.name, runner);
    else emitter.on(event.name, runner);
  }
  if (mod.onLoad) {
    try {
      await mod.onLoad(client);
    } catch (error) {
      logger.error({ err: error, module: mod.id }, "module onLoad failed");
    }
  }
}

registerInteractionRouter(client);

client.once(Events.ClientReady, async (readyClient) => {
  logger.info({ user: readyClient.user.tag }, `${readyClient.user.username} online`);
  readyClient.user.setPresence({
    activities: [{ name: "/help · /setup start", type: ActivityType.Listening }],
    status: "online",
  });
  // the app profile, avatar, username and nicknames are PATCHed only when asked (ZARU_SYNC_PROFILE=1 after a
  // branding change), not on every boot: each is a rate-limited write Discord remembers
  if (process.env.ZARU_SYNC_PROFILE === "1") {
    await publishApplicationProfile(client.rest);
    await applyBotDisplayName(readyClient);
  }
  // slash commands are re-registered only when their definitions changed since the last boot
  const commandJson = [...client.commands.values()].map((c) => c.data.toJSON());
  const commandHash = createHash("sha256").update(JSON.stringify(commandJson)).digest("hex");
  const hashFile = path.join(__dirname, "..", ".commands-hash");
  const lastHash = fs.existsSync(hashFile) ? fs.readFileSync(hashFile, "utf8").trim() : "";
  if (lastHash === commandHash) {
    logger.info({ count: client.commands.size }, "slash commands unchanged, not re-registered");
  } else {
    try {
      await readyClient.application.commands.set(commandJson);
      fs.writeFileSync(hashFile, commandHash);
      logger.info({ count: client.commands.size }, "slash commands synced");
    } catch (error) {
      logger.warn({ err: error }, "slash command sync failed");
    }
  }
  // the dashboard tells the bot about setting changes over LISTEN; a slow first connection must not mean giving up
  void (async () => {
    for (let attempt = 1; attempt <= 20; attempt++) {
      try {
        await Promise.race([
          startGuildConfigListener(pool, client.guildConfig),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error("guild config listener timeout")), 15_000);
          }),
        ]);
        logger.info({ attempt }, "guild config listener ready");
        return;
      } catch (error) {
        logger.warn({ err: error, attempt }, "guild config listener not up yet, retrying in 30 s");
        await new Promise((resolve) => setTimeout(resolve, 30_000));
      }
    }
    logger.error("guild config listener gave up: dashboard changes reach the bot only after a restart");
  })();
  startJobs(client);
  try {
    const { attachPlayer } = await import("./lib/player.js");
    await attachPlayer(client);
  } catch (error) {
    logger.error({ err: error }, "music player failed to start");
  }
  for (const guild of readyClient.guilds.cache.values()) {
    await upsertGuild(client, {
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      ownerId: guild.ownerId,
    });
  }
});

client.on(Events.GuildCreate, async (guild) => {
  await upsertGuild(client, {
    id: guild.id,
    name: guild.name,
    icon: guild.icon,
    ownerId: guild.ownerId,
  });
  logger.info({ guildId: guild.id, name: guild.name }, "joined guild");
});

// login with backoff: a rate limit or a network blip waits and retries instead of crash-looping; a bad token stops
logger.info("discord login starting");
for (let attempt = 1; ; attempt++) {
  try {
    await client.login(env.DISCORD_TOKEN.trim());
    break;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "TokenInvalid" || code === "DisallowedIntents") {
      logger.fatal({ err: error }, "discord login refused; fix the token or intents");
      await shutdown(1, code);
    }
    const waitMs = Math.min(10 * 60_000, 15_000 * 2 ** (attempt - 1));
    logger.error({ err: error, attempt, waitMs }, "discord login failed, retrying");
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}
logger.info("discord login returned");
