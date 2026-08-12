import http from "node:http";
import { logger } from "./logger.js";

export function startHealthServer(port: number, isDiscordReady?: () => boolean) {
  const server = http.createServer((req, res) => {
    const path = req.url?.split("?")[0] ?? "";
    if (path === "/healthz" || path === "/" || path === "/uptime") {
      res.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(
        JSON.stringify({
          ok: true,
          service: "knox-bot",
          discord: Boolean(isDiscordReady?.()),
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
