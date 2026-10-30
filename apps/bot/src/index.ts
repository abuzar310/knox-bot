import { createHash } from "node:crypto";
import dns from "node:dns";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, setGlobalDispatcher } from "undici";
import { ActivityType, Events } from "discord.js";
import { applyMigrations, createDb, guilds } from "@knox/db";
import { acquireInstanceLock, type InstanceLock } from "./lib/instance-lock.js";
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
import { cutGatewaySocket, dropGatewaySession, replaceGatewayShard } from "./lib/gateway-recover.js";
import { createGatewayWatch } from "./lib/gateway-watch.js";
import { catchUpRecentPrefix } from "./lib/prefix-message.js";

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
let instanceLock: InstanceLock | null = null;
startHealthServer(env.healthPort, () => ({
  ready: client.isReady(),
  wsPing: client.ws.ping,
  voice:
    [...client.guilds.cache.values()]
      .map((guild) => guild.members.me?.voice.channelId)
      .find(Boolean) ?? null,
  voicePing: client.music?.voicePing() ?? null,
}));
startKeepAlive();
client.rest.on("rateLimited", (info) => {
  logger.warn(info, "discord rate limited");
});
let restartForGateway: ((why: string) => void) | null = null;
const gatewayWatch = createGatewayWatch();
client.on(Events.Debug, (message) => {
  const shardId = Number(/Shard (\d+)/.exec(message)?.[1] ?? 0);
  if (message.includes("Heartbeat acknowledged")) {
    gatewayWatch.onAck(Date.now());
    const latency = Number(/latency of (\d+)ms/.exec(message)?.[1]);
    // a probe answer is timed from the library heartbeat, so the reported ping can look huge
    if (latency > 5_000) {
      const shard = client.ws.shards.get(shardId);
      const keep = shard?.ping;
      queueMicrotask(() => {
        if (!shard || shard.ping <= 5_000) return;
        shard.ping = typeof keep === "number" && keep >= 0 && keep <= 5_000 ? keep : -1;
      });
    }
  }
  if (/Zombie connection/i.test(message)) {
    const action = gatewayWatch.onZombie(Date.now());
    if (action === "unstick") {
      const cut = cutGatewaySocket(client, shardId);
      dropGatewaySession(client, shardId);
      logger.fatal({ shardId, cut }, "zombie gateway; identifying in this process");
    }
  }
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
    await instanceLock?.release().catch(() => undefined);
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

// A quiet socket is cut here and Discord is logged in again without leaving the process.
// The process exits only when that new login never finishes, or the socket keeps dying.
let gatewayWasReady = false;
let gatewayDownSince = 0;
restartForGateway = (why: string) => {
  if (!gatewayWasReady) return;
  logger.fatal({ why }, "discord gateway lost; restarting");
  void shutdown(1, why);
};
setInterval(() => {
  if (!gatewayWasReady || stopping) return;
  if (client.isReady()) {
    gatewayDownSince = 0;
    return;
  }
  if (!gatewayDownSince) gatewayDownSince = Date.now();
  if (Date.now() - gatewayDownSince > 20_000) restartForGateway?.("gateway stayed down");
}, 5_000).unref();
setInterval(() => {
  if (!gatewayWasReady || stopping) return;
  const shard = client.ws.shards.get(0);
  if (!shard) return;
  // ping stays -1 until Discord answers a real heartbeat; probing before that
  // makes the reported latency look like a timestamp
  const sanePing = shard.ping >= 0 && shard.ping <= 5_000;
  const action = gatewayWatch.tick(Date.now(), shard.status === 0 && sanePing);
  if (action === "probe") {
    const sequence = (shard as { sessionInfo?: { sequence?: number } | null }).sessionInfo?.sequence ?? null;
    try {
      shard.send({ op: 1, d: sequence });
    } catch (error) {
      logger.warn({ err: error }, "gateway probe failed");
    }
    return;
  }
  if (action === "replace") {
    logger.fatal("heartbeat ack missing; replacing gateway socket");
    void replaceGatewayShard(client, shard.id, "heartbeat ack timeout").catch((error) => {
      logger.warn({ err: error }, "gateway replace failed");
    });
    return;
  }
  if (action === "restart") restartForGateway?.("gateway replace failed");
}, 1_000).unref();

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
  gatewayWasReady = true;
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
  void catchUpRecentPrefix(client);
});

client.on(Events.ShardReady, () => {
  client.user?.setPresence({
    activities: [{ name: "/help · /setup start", type: ActivityType.Listening }],
    status: "online",
  });
  gatewayWatch.onShardReady(Date.now());
  if (!client.music) return;
  logger.info("gateway ready again, checking recent commands");
  void client.music.rejoinAfterGateway();
  void catchUpRecentPrefix(client);
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
// the music stack (voice, opus, ffmpeg, yt-dlp) loads before logging in: on this PC the antivirus can hold that first
// load for minutes, and such a stall must not happen while a gateway session is waiting for heartbeats
const { attachPlayer } = await import("./lib/player.js");
const { warmUpVoice } = await import("./lib/music-session.js");
warmUpVoice();

// a copy started without an AI key is a misconfigured duplicate (wrong/partial env): it would answer every
// "ZARU, ..." with "I can't understand without an AI key" and spam the server. Refuse to run unless the operator
// explicitly wants a no-AI instance. The real deployment always has a key, so this only stops rogue copies.
{
  const { aiProvider } = await import("./lib/ai-moderation.js");
  if (!aiProvider() && process.env.KNOX_ALLOW_NO_AI !== "1") {
    logger.fatal("no AI key (GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY) found — refusing to start so a misconfigured copy can't spam the server. Set KNOX_ALLOW_NO_AI=1 to run without AI.");
    await shutdown(1, "no AI key");
  }
}

// one ZARU at a time: a second copy with this token waits here instead of answering everything twice
instanceLock = await acquireInstanceLock(pool);
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
