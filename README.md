# Knox

Multi-server Discord master bot + dashboard. Phase 1 is the foundation: slash commands, module loader, PostgreSQL guild config, Discord OAuth dashboard, Docker deploy.

## Stack

- `apps/bot` — discord.js v14 (TypeScript)
- `apps/web` — Next.js dashboard (Auth.js Discord login)
- `packages/db` — PostgreSQL + Drizzle
- `packages/config` — Zod guild settings
- `packages/shared` — ranks, brand, module ids

## Quick start (local)

1. Copy env and fill Discord secrets:

```bash
cp .env.example .env
```

2. Install and start Postgres:

```bash
pnpm install
docker compose up -d postgres
```

3. Generate/apply migrations:

```bash
pnpm db:generate
pnpm db:migrate
```

4. Register slash commands and run:

```bash
pnpm --filter @knox/bot register
pnpm --filter @knox/bot dev
pnpm --filter @knox/web dev
```

Bot health: `http://localhost:3080/healthz`  
Dashboard: `http://localhost:3000`

## Discord Developer Portal setup

1. Create an application at [Discord Developer Portal](https://discord.com/developers/applications)
2. **Bot** → Reset Token → put in `DISCORD_TOKEN`
3. Enable **Server Members Intent**, **Message Content Intent**, **Guild Voice States**, and **Message Reactions** (Invite tracking uses Manage Server, not a privileged intent)
4. **OAuth2** → copy Client ID / Client Secret → `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`
5. Add redirect: `http://localhost:3000/api/auth/callback/discord` (and your production URL later)
6. Invite URL scopes: `bot` + `applications.commands` (Administrator or a tighter perm set you prefer)

## Manual E2E checklist

1. Secrets in `.env`
2. `pnpm db:migrate`
3. `pnpm --filter @knox/bot register`
4. Start bot + web
5. Invite bot to Knox + a test server
6. Run `/ping` and `/help`
7. Dashboard login → set embed color → save
8. Run `/help` again — color updates without restarting the bot

## Render deploy (Singapore — lowest latency for IN/SEA)

Blueprint: [`render.yaml`](./render.yaml)

1. Push this repo to GitHub
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** → select repo
3. Region is locked to **singapore** (bot + web + Postgres together = private network, low RTT)
4. Fill sync:false env vars: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `NEXTAUTH_URL`, `DISCORD_REDIRECT_URI`
5. After URLs exist, set:
   - `NEXTAUTH_URL=https://knox-web-gofn.onrender.com`
   - `DISCORD_REDIRECT_URI=https://knox-web-gofn.onrender.com/api/auth/callback/discord`
6. Discord portal → same redirect + **Message Content** + **Server Members** + **Voice States** + **Message Reactions** intents
7. Register commands against production token:
   ```bash
   DISCORD_TOKEN=... DISCORD_CLIENT_ID=... DATABASE_URL=... pnpm --filter @knox/bot register
   ```

Bot is a **web** service (not worker) so it exposes `/healthz` for keep-alive.

### UptimeRobot sync (anti-sleep + alerts)

Free Render web services sleep without traffic. Ping every **60s** (paid UptimeRobot) or **300s** (free UptimeRobot):

```bash
# .env or shell
export UPTIMEROBOT_API_KEY=your_uptimerobot_api_key
export KNOX_BOT_URL=https://knox-bot.onrender.com
export KNOX_WEB_URL=https://knox-web-gofn.onrender.com
export UPTIMEROBOT_INTERVAL_SECONDS=60

pnpm uptime:sync
```

Config: [`uptimerobot.config.json`](./uptimerobot.config.json) · script: [`scripts/sync-uptimerobot.mjs`](./scripts/sync-uptimerobot.mjs)

Monitors hit `/healthz` and `/api/health` with keyword `"ok":true` (fast JSON, no HTML).

## Oracle Always Free deploy

1. Create an Always Free Ampere/AMD instance (Ubuntu)
2. Install Docker + Compose plugin
3. Clone this repo, copy `.env` with production values (`NEXTAUTH_URL=https://your.domain`)
4. Point DNS A record at the VPS; put Caddy in front when ready
5. `docker compose up -d --build`
6. Re-register commands once against production token/client id

## Moderation (live)

Slash commands: `/warn` `/mute` `/unmute` `/kick` `/ban` `/unban` `/case` `/history`

Automod (dashboard → Moderation): anti-invite, anti-spam, max mentions. Actions write cases + optional mod-log channel.

Enable **Message Content Intent** in the Discord Developer Portal (required for automod).

Anti-raid and anti-phishing (also on the dashboard):

```
/antiraid view
/antiraid joingate min_account_age:24 require_avatar:true
/antiraid threshold joins_per_minute:10
/antiraid phishing enabled:true
/raidmode on minutes:30
/raidmode status
/raidmode off
```

The join gate DMs and kicks accounts that are too new or have no avatar (no welcome, no invite credit). Raid mode pauses invites (needs **Manage Server**) and turns every join away until it ends; it switches on by itself at the join threshold and tells the owner. Anti-phishing deletes messages with links to known scam domains (three community lists, refreshed every 6 h) or fake Discord/Nitro/Steam look-alikes, and times the sender out for 10 minutes; moderators with Manage Messages are never affected.

## Community setup (one command)

`/setup` controls welcome, goodbye, invite tracking, autorole, logs, and embed color.

One shot:

```
/setup start welcome:#welcome goodbye:#goodbye invites:#invites track_invites:true autorole:@Member logs:#mod-log
```

Or piece by piece:

```
/setup view
/setup welcome channel:#welcome message:Welcome {user} to {server}!
/setup goodbye channel:#goodbye
/setup invites enabled:true channel:#invites
/setup autorole role:@Member
/setup logs channel:#mod-log
/setup color hex:#E8FF47
/invites
/invites user:@someone
/invites top:true
```

Placeholders: `{user}` `{username}` `{server}` `{membercount}` `{inviter}` `{invites}`

Install a full channel/role layout into the **existing** server (nothing is deleted):

```
/setup template preset:Gaming
/setup template code:https://discord.new/YOURCODE
/setup save-template name:Knox layout
```

After the preview, click **Install into this server** (or add `apply:True`).

Give Knox **Manage Server**, **Manage Channels**, **Manage Roles**, **Connect**, and **Speak**.

Music: join a voice channel, then:

```
/play query:never gonna give you up
?play kalyani
/play query:https://www.youtube.com/watch?v=dQw4w9WgXcQ
/play query:https://open.spotify.com/playlist/...
/skip
/pause
/nowplaying
/queue
/stop
```

Spotify cannot stream its own audio to Discord. Knox reads the Spotify track/playlist, then plays the matching YouTube audio. Optional Render env: `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` (better playlist metadata).

## Alerts (creator notifications)

Follow creators and feeds; new uploads, posts and live streams are announced in a channel, with an optional role ping.

```
/feed add youtube channel:@mkbhd post_in:#videos ping:@Subs
/feed add rss url:https://github.com/discordjs/discord.js/releases.atom post_in:#dev-news
/feed add twitch channel:pokimane post_in:#live ping:@Live
/feed add kick channel:xqc post_in:#live message:{role} {author} is live: {title} {url}
/feed list
/feed test number:1
/feed edit number:1 message:{role} new drop from {author}: {title} {url}
/feed remove number:1
/feed resume number:1
```

YouTube and RSS need no API key (YouTube's public channel feed is read). Twitch and Kick need free developer-app credentials on the host: `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` (dev.twitch.tv) and `KICK_CLIENT_ID` + `KICK_CLIENT_SECRET` (kick.com/settings/developer); without them `/feed add twitch|kick` says so.

Placeholders: `{role}` `{author}` `{title}` `{url}` `{game}` `{viewers}` `{server}`. Uploads and posts are checked every 5 minutes, streams every 2; up to 15 feeds per server; only items from the moment a feed is added are posted; a feed that fails 20 checks in a row pauses itself and says so in the log channel.

`/autopublish add channel:#announcements` publishes every post in an announcement channel to the servers following it (Discord allows 10 an hour per channel; ZARU keeps under it). ZARU needs **Manage Messages** there to publish other people's posts.

## Live modules

- **Levels** — `/rank` `/levels` `/level` `/eco` `/rep` `/birthday` (chat XP + coins)
- **Tickets / RR / giveaways** — `/ticket` `/reactionrole` `/giveaway` `/verify`
- **Server tools** — `/starboard` `/logging` `/voicehub` `/counting` `/serverstats` `/embed` `/tag` `/afk` `/snipe` `/poll` `/reminder` `/suggest`
- **Gaming** — `/lfg` `/fun`
- **Music** — `?play` `/play` `/playnext` `/playskip` `/mix` `/search` `/skip` `/queue` `/reconnect` (famous full tracks, public Spotify playlists, autoplay, Not this; reconnect if voice goes silent)
- **Alerts** — `/feed` (YouTube uploads, RSS/Atom, Twitch and Kick live) · `/autopublish`

## Phase roadmap

1. Foundation ✅  
2. Moderation ✅  
3. Community / welcome / invites / templates ✅  
4. Levels / economy / tickets / giveaways / starboard ✅  
5. Gaming ✅  
6. Music — YouTube + Spotify playback ✅  
7. Alerts — YouTube / RSS / Twitch / Kick notifications, auto-publish ✅
