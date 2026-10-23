import { z } from "zod";

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  KNOX_WEB_URL: z.string().url().optional(),
  YOUTUBE_COOKIE: z.string().optional(),
  YOUTUBE_COOKIES_JSON: z.string().optional(),
  /** optional: a free Twitch developer app lets /feed add twitch announce live streams */
  TWITCH_CLIENT_ID: z.string().optional(),
  TWITCH_CLIENT_SECRET: z.string().optional(),
  /** optional: a free Kick developer app lets /feed add kick announce live streams */
  KICK_CLIENT_ID: z.string().optional(),
  KICK_CLIENT_SECRET: z.string().optional(),
  /** optional: AI moderation. OpenAI's moderation endpoint is free to call; Claude is the alternative */
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Render injects PORT; local/dev uses BOT_HEALTH_PORT or 3080 */
  PORT: z.coerce.number().optional(),
  BOT_HEALTH_PORT: z.coerce.number().default(3080),
});

export type BotEnv = z.infer<typeof envSchema> & { healthPort: number };

export function loadEnv(): BotEnv {
  const parsed = envSchema.parse(process.env);
  return {
    ...parsed,
    healthPort: parsed.PORT ?? parsed.BOT_HEALTH_PORT,
  };
}
