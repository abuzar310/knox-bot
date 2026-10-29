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

The Discord gateway needs `DISCORD_TOKEN` + `DISCORD_CLIENT_ID` + `DATABASE_URL`. Vercel has Neon `DATABASE_URL` and Discord OAuth client id/secret. It does **not** have `DISCORD_TOKEN` (that lives on Render). Starting a second ZARU against the production database with the same token waits on the instance lock instead of answering twice.

This VM had no Docker and no bot token at start. Do not put tokens in git.

## Secrets

GitHub and Vercel tokens were pasted in the chat. They are not stored in this repo. Rotate both, then put replacements only in host env / Cursor secrets.

## Open

- `DISCORD_TOKEN` still required before ZARU can log in from this VM.
- Optional AI keys (`GEMINI_API_KEY` / `OPENAI_API_KEY`) for the assistant.
- Dashboard still has no channel-name pickers (ids only), same as the other pages.
