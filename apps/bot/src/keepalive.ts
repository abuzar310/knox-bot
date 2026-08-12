import { logger } from "./logger.js";

const INTERVAL_MS = 4 * 60 * 1000;

export function startKeepAlive() {
  const base = (
    process.env.KNOX_BOT_URL ??
    process.env.RENDER_EXTERNAL_URL ??
    ""
  ).replace(/\/$/, "");
  if (!base) {
    logger.warn("keep-alive skipped: no public bot URL");
    return;
  }

  const url = `${base}/healthz`;
  const ping = () => {
    void fetch(url).catch((err) => {
      logger.warn({ err }, "keep-alive ping failed");
    });
  };

  ping();
  setInterval(ping, INTERVAL_MS);
  logger.info({ url, intervalMs: INTERVAL_MS }, "keep-alive started");
}
