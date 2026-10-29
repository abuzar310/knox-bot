# Recovered from git (archived Cursor session)

The previous Cursor cloud agent was archived. Its transcript is not available from this environment. Everything below is reconstructed from `github.com/abuzar310/knox-bot` on `main` at `2bef69b` (2026-10-29).

## What Knox / ZARU is

Multi-server Discord bot + Next.js dashboard. Public brand is **ZARU Bot**, made by Abuzar. Repo name is still Knox.

- `apps/bot` — discord.js v14, prefix `?` and slash commands, natural-language staff assistant
- `apps/web` — marketing site, command catalog, Discord OAuth dashboard
- `packages/db` — PostgreSQL + Drizzle
- `packages/config` — Zod guild settings
- `packages/shared` — ranks, brand, module ids

Live hosts:

- Bot: Render `knox-bot-gdf2` (`https://knox-bot-gdf2.onrender.com`)
- Web: Render `knox-web-gdf2` and Vercel project `zaru-bot` (`https://knox-web-mauve.vercel.app`)
- Database: Neon Postgres (Vercel env `DATABASE_URL`)

Roadmap in the README is complete through phase 7 (foundation, moderation, community, levels/economy/tickets, gaming, music, alerts).

## Git timeline (newest first)

All `cursor/*-0959` branches are already merged into `main`. Nothing was left unmerged.

| Commit | What landed |
| --- | --- |
| `2bef69b` | `?musicroom` / `/room` makes a 24/7 Music voice channel in the Voice category plus a `#music` text channel. ZARU stays in that voice channel. |
| `7d92067` | Music request channel: a song name typed there plays it. Panel: grab, replay, bass, nightcore, vaporwave. Dashboard music page for channel, volume, leave timer. |
| `0b76370` | “What was recently added” mentions welcome-card layout and dashboard-queued self-roles. |
| `3a5d50e` | Nested tags, welcome-card subtitle/avatar/overlay, dashboard self-role draft, process restarts after a crash. |
| `d48f46f` | Finish dashboard: raid, voice, welcome controls. |
| `0079c58` | Dashboard pages and modules the big bots are used for. |
| `55dbfd4` | Staff lessons: remember what the owner tells ZARU; name who got a role. |
| `aa10544` | “Who made you” → Abuzar. |
| `90d43f4` | Abuzar and Suhaib can moderate Owner-role members. |
| `843ca66` | Recently-added answers from setup ZARU already posted. |
| `da5ccba` | Chat closed until age is picked; self-roles restored. |
| `e2122e8` | Join gate: gender, 18+/18-, games. |
| `4fc7897` | Welcome picture card with Rules and Chat buttons. |
| `4739c8d` | Scam sweep reports when it checked the whole server. |
| `1a44bff` | Sentences starting with `remove` reach ZARU. |
| `f0a6112` | Delete `@everyone` image-scam posts without asking the model. |
| `64d2bfe` | Purge can keep an announcement. |
| `5cae366` | Natural-language purge, including messages older than 14 days. |
| `f8bd3dc` | Assistant reads last 10 messages, including ticket panels. |
| `bf3318a` / `668534a` | Channel visibility from real Discord permissions; refuse ungrounded server facts. |
| `e65f3af` | Discord login `iss` (issuer) check. |
| PR #1 `d0d5d2f` | ZARU Bot product homepage, economy, dashboard. |

Earlier: UnbelievaBoat-style economy, prefix chat, protected roles, coin log, Yes/No before irreversible punishments, staff ranks, music, feeds, automod, tickets, and the rest of the README modules.

## Dashboard coverage at recovery

Pages: Overview, Tickets, Economy, Moderation, Logs, Welcome, Setup, Automod, Activity, Music, Permissions.

Alerts (`/feed` YouTube, RSS, Twitch, Kick, Bluesky) existed in the bot and on the marketing site, but had no dashboard page.

## What was not in git

- Cursor chat transcript (archived)
- Discord bot token (Render env only, not in Vercel)
- Any uncommitted local files from the old session
