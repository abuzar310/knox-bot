# 2026-10-29 — resume after archived session

Agent: Cursor cloud `bc-01a188b8-7cbf-73a4-8c99-5cea9004ae4c`  
Repo: `github.com/abuzar310/knox-bot`  
Branch: `cursor/session-history-alerts-ae4c`

## Ask

Continue the bot after the last session was archived. Recover from git. From now on keep session history in this Knox repo. Run the bot on this cloud VM. GitHub and Vercel tokens were pasted in chat for deploy access.

## Recovered

See [recovered-from-git.md](./recovered-from-git.md). `main` was at `2bef69b` (24/7 Music room). Archived Cursor chats are not readable from this environment. Vercel `zaru-bot` production is that same commit. Render bot/web deployments track `main`.

## Shipped this session

- This `docs/session-history/` log, so the next archived chat still leaves a paper trail.
- Dashboard **Alerts** page: list, add, remove, pause, resume YouTube / RSS / Twitch / Kick / Bluesky feeds, plus auto-publish channel ids. Same `feed_subscriptions` table `/feed` uses.

## Run on this VM

The Discord gateway needs `DISCORD_TOKEN` + `DISCORD_CLIENT_ID` + `DATABASE_URL`. Vercel has Neon `DATABASE_URL` and Discord OAuth client id/secret. Render holds the live bot token.

This VM had no Docker. Local Postgres is installed for a scratch database. A later start used the production Neon database (1 guild) and took the instance lock, so Render was not holding it.

A bot token pasted in chat was stored only in gitignored `.env`. Discord's API returned 401, and the gateway said the token was invalid. The supervisor was stopped. The token was removed from `.env` and was not committed. A new token from the Discord Developer Portal (Bot → Reset Token) is still required before ZARU can log in here.

## Secrets

GitHub and Vercel tokens were pasted in the chat. They are not stored in this repo. Rotate both, then put replacements only in host env / Cursor secrets.

## Open

- Discord rejected the pasted bot token (401). Reset it in the Developer Portal and put the new value in this VM's `.env` only.
- Optional AI keys (`GEMINI_API_KEY` / `OPENAI_API_KEY`) for the assistant.
- Dashboard still has no channel-name pickers (ids only), same as the other pages.
