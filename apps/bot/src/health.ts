import http from "node:http";
import { logger } from "./logger.js";

export function startHealthServer(
  port: number,
  status?: () => boolean | { ready?: boolean; wsPing?: number },
) {
  const server = http.createServer((req, res) => {
    const path = req.url?.split("?")[0] ?? "";
    if (path === "/healthz" || path === "/" || path === "/uptime") {
      const snap = status?.();
      const ready = typeof snap === "object" ? Boolean(snap.ready) : Boolean(snap);
      const wsPing = typeof snap === "object" ? snap.wsPing : undefined;
      res.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(
        JSON.stringify({
          ok: true,
          service: "knox-bot",
          discord: ready,
          wsPing,
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
