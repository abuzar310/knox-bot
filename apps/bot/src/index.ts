import dns from "node:dns";
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
}));
startKeepAlive();
client.rest.on("rateLimited", (info) => {
  logger.warn(info, "discord rate limited");
});
client.on(Events.Debug, (message) => {
  if (/Heartbeat|heartbeatLatency|Provided token/i.test(message)) return;
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
const { db, pool } = createDb(env.DATABASE_URL);
client.db = db;
client.pool = pool;
client.guildConfig = new GuildConfigCache(db);

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
  await publishApplicationProfile(client.rest);
  await applyBotDisplayName(readyClient);
  try {
    await readyClient.application.commands.set(
      [...client.commands.values()].map((c) => c.data.toJSON()),
    );
    logger.info({ count: client.commands.size }, "slash commands synced");
  } catch (error) {
    logger.warn({ err: error }, "slash command sync failed");
  }
  void Promise.race([
    startGuildConfigListener(pool, client.guildConfig),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("guild config listener timeout")), 5000);
    }),
  ]).catch((error) => {
    logger.warn({ err: error }, "guild config listener failed");
  });
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

logger.info("discord login starting");
const loginP = client.login(env.DISCORD_TOKEN.trim());
try {
  logger.info("database migrate starting");
  await Promise.race([
    applyMigrations(env.DATABASE_URL),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("migrate timeout")), 15_000);
    }),
  ]);
  logger.info("database migrations applied");
} catch (error) {
  logger.error({ err: error }, "database migrate failed");
}
await loginP;
logger.info("discord login returned");
