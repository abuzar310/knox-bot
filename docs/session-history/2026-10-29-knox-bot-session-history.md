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

The first pasted bot token was rejected (401) and removed from `.env`. A replacement token, also only in gitignored `.env`, logged in. `scripts/supervise.sh` is running in a tmux session on this VM. Health on port 3080 reports Discord connected. The production instance lock is held here, so a Render copy waits instead of answering twice. The token is not in git.

A Gemini API key was added to the same `.env` and checked with a one-word request. The supervisor was restarted so the running process actually has `GEMINI_API_KEY`. The key is not in git. Staff sentences that start with `ZARU,` can use it. AI moderation still has to be switched on per server with `/antiraid ai`.

## Secrets

GitHub and Vercel tokens were pasted in the chat. They are not stored in this repo. Rotate both, then put replacements only in host env / Cursor secrets.

## Latency

The process stays on this Virginia VM. The Discord server voice region is India, so music packets still cross that path. YouTube often refuses a download from this IP, so playback falls through to SoundCloud. A short encoder stall used to stop the song after 100 ms and leave the panel looking stuck. The player now tolerates a longer stall, and an end that arrives while the next file is attaching is kept and played instead of dropped. YouTube's sign-in wall is not retried. SoundCloud search starts while YouTube is still being tried. The music panel has a Filter off button, and pressing the lit Bass, Night, or Vapor button again returns the sound to normal. yt-dlp is invoked with this machine's Node so it can run YouTube's JavaScript challenge, and name search asks yt-dlp first.

## Open

- ZARU is online on this VM with Gemini configured. Reset the bot token and the Gemini key when this VM is no longer the host, because both were pasted in chat.
- Dashboard still has no channel-name pickers (ids only), same as the other pages.
