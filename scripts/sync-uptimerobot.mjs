#!/usr/bin/env node
/**
 * Sync UptimeRobot monitors with Knox Render health endpoints.
 * Lowest practical interval: 60s (UptimeRobot paid). Free plan = 300s floor on their side.
 *
 * Usage:
 *   set UPTIMEROBOT_API_KEY=...
 *   set KNOX_BOT_URL=https://knox-bot.onrender.com
 *   set KNOX_WEB_URL=https://knox-web.onrender.com
 *   node scripts/sync-uptimerobot.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const configPath = path.join(root, "uptimerobot.config.json");

const API = "https://api.uptimerobot.com/v2";
const apiKey = process.env.UPTIMEROBOT_API_KEY;

if (!apiKey) {
  console.error("Missing UPTIMEROBOT_API_KEY");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const interval = Number(process.env.UPTIMEROBOT_INTERVAL_SECONDS ?? config.intervalSeconds ?? 60);

async function api(endpoint, body = {}) {
  const params = new URLSearchParams({
    api_key: apiKey,
    format: "json",
    ...Object.fromEntries(
      Object.entries(body).map(([k, v]) => [k, String(v)]),
    ),
  });

  const res = await fetch(`${API}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const json = await res.json();
  if (json.stat !== "ok") {
    throw new Error(`${endpoint} failed: ${JSON.stringify(json)}`);
  }
  return json;
}

function joinUrl(base, p) {
  return `${base.replace(/\/$/, "")}${p.startsWith("/") ? p : `/${p}`}`;
}

const list = await api("getMonitors", { logs: "0" });
const existing = new Map(
  (list.monitors ?? []).map((m) => [m.friendly_name, m]),
);

for (const mon of config.monitors) {
  const base = process.env[mon.urlEnv];
  if (!base) {
    console.warn(`Skip ${mon.friendlyName}: set ${mon.urlEnv}`);
    continue;
  }

  const url = joinUrl(base, mon.path);
  const payload = {
    friendly_name: mon.friendlyName,
    url,
    type: "1", // HTTP(s)
    interval: String(interval),
    timeout: String(config.timeoutSeconds ?? 30),
    http_method: "1", // GET — lowest overhead
    keyword_type: String(mon.keywordType ?? 2), // 2 = exists
    keyword_value: mon.keywordValue ?? "ok",
  };

  const found = existing.get(mon.friendlyName);
  if (found) {
    await api("editMonitor", { id: found.id, ...payload });
    console.log(`Updated: ${mon.friendlyName} → ${url} (${interval}s)`);
  } else {
    await api("newMonitor", payload);
    console.log(`Created: ${mon.friendlyName} → ${url} (${interval}s)`);
  }
}

console.log("UptimeRobot sync complete");
