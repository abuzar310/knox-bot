import pino from "pino";

export const logger = pino({
  name: "knox-bot",
  level: process.env.LOG_LEVEL ?? "info",
});
