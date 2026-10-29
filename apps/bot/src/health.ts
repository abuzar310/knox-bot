import http from "node:http";
import { logger } from "./logger.js";

export function startHealthServer(
  port: number,
  status?: () => boolean | { ready?: boolean; wsPing?: number; voice?: string | null; voicePing?: { udp?: number; ws?: number } | null },
) {
  const server = http.createServer((req, res) => {
    const path = req.url?.split("?")[0] ?? "";
    if (path === "/healthz" || path === "/" || path === "/uptime") {
      const snap = status?.();
      const ready = typeof snap === "object" ? Boolean(snap.ready) : Boolean(snap);
      const wsPing = typeof snap === "object" ? snap.wsPing : undefined;
      const voice = typeof snap === "object" ? snap.voice : undefined;
      const voicePing = typeof snap === "object" ? snap.voicePing : undefined;
      // 503 while the gateway is down, so a watcher (UptimeRobot, the launcher) notices a dead bot
      res.writeHead(ready ? 200 : 503, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(
        JSON.stringify({
          ok: ready,
          service: "knox-bot",
          discord: ready,
          wsPing,
          voice,
          voicePing,
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(port, "0.0.0.0", () => {
    logger.info({ port }, "health server listening");
  });

  return server;
}
