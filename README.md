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

## Talk to ZARU

Staff can give ZARU instructions in plain words, in a message starting with `ZARU,` (or an @mention) or with `/zaru do:…`:

```
ZARU, create a role called Raiders and a private channel raid-plans that only Raiders can see
ZARU, kick Rahul, spamming invites
ZARU, time out @Someone for 30 minutes
ZARU, lock #general and post "chat is paused for 10 minutes"
ZARU, move #memes under Community and rename it to funny-stuff
ZARU, how many channels have no category?
```

ZARU turns the sentence into concrete steps (create/rename/move/delete channels and categories, create/give/remove/delete roles, make a channel visible only to a role, lock/unlock, slowmode, topics, nicknames, kick/ban/timeout, purge, post a message), checks that **you** hold the Discord permission for each step and outrank the target, does them, and reports each result; everything is written to the log channel. Bans, deletions and big purges show a Confirm button first. Needs an AI key on the host (Gemini, OpenAI or Claude).

## One-command setup

When ZARU joins a server (and once for servers it was already in) it reads the whole server first: every channel's purpose, categories, visibility and last activity, the roles and their powers, other bots and Discord's AutoMod rules, using Gemini (or OpenAI/Claude) when a key exists and plain rules otherwise. It posts **what it understands**, what it would fix, and two buttons: **Set up everything** and **Tidy up channels** (creates missing rules/announcements/support channels and puts stray channels under categories; it never deletes or renames). `/setup scan` repeats the read any time; `/setup auto` runs the setup (needs Manage Server).

Setup reuses what the scan found: an existing hidden log channel, the real welcome channel, the rules and announcements channels (an announcement-type one is auto-published), and the roles with moderator powers become ZARU's admin and mod ranks. It creates or reuses a staff-only `#zaru-log`, welcome and goodbye messages with picture cards in the system channel, a **Tickets** category with a topic panel in `#open-a-ticket`, a staff-only `#modmail`, a `#starboard`, a member-count channel, switches on anti-phishing, anti-invite, anti-spam, nickname cleanup, automatic raid mode at 10 joins a minute, voice XP, bump reminders, the weekly digest, and installs Discord's native AutoMod rules. It never duplicates what already exists and lists anything that still needs a human (missing permissions, API keys, staff roles).

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
/antiraid ai enabled:true
/automod words add words:*gaali*, *teri maa ki*   ·   /automod words list   ·   /automod words reset
/raidmode on minutes:30
/raidmode status
/raidmode off
```

`/temprole give user:@someone role:@Event duration:2d reason:Tournament weekend` gives a role for a while and takes it back on time (`/temprole list`, `/temprole remove`).

`/raidmode lockdown on reason:Raid` denies Send Messages for @everyone in every public text channel (each gets a 🔒 note) and `/raidmode lockdown off` reopens exactly those channels. `/decancer user:@someone` makes a zalgo or look-alike nickname readable; `/decancer auto enabled:true` does it by itself on join and rename (names in any script are kept; only unreadable ones change). With member logging on, nickname and role changes are written to the log channel.

Discord-native AutoMod in one go (rules live in Server Settings → AutoMod and work even when ZARU is offline; needs **Manage Server**):

```
/automod setup word_lists:true mention_limit:5 timeout_minutes:10 spam:true
/automod rules
/automod clear
```

The join gate DMs and kicks accounts that are too new or have no avatar (no welcome, no invite credit). Raid mode pauses invites (needs **Manage Server**) and turns every join away until it ends; it switches on by itself at the join threshold and tells the owner. Anti-phishing deletes messages with links to known scam domains (three community lists, refreshed every 6 h) or fake Discord/Nitro/Steam look-alikes, and times the sender out for 10 minutes; moderators with Manage Messages are never affected.

AI moderation (`/antiraid ai`) scores every non-staff message with OpenAI's moderation endpoint (`OPENAI_API_KEY`, free to call), Gemini flash-lite (`GEMINI_API_KEY`, free tier) or Claude (`ANTHROPIC_API_KEY`, paid per message), in that order of preference: clear threats, harassment, hate, sexual content involving minors and self-harm instructions are deleted with a 10-minute timeout; borderline messages are written to the log channel for a human look. At most 30 checks a minute per server; repeated text is cached.

On top of that, `/automod words` keeps a Discord-native keyword rule: messages containing any listed word are blocked before they post, whoever is online. `/setup auto` installs ZARU's default Hindi/Hinglish abuse list (madarchod, bhenchod, bhosdi, chutiya, randi, gaand, harami, "teri maa ki", "ki aulad" and their Devanagari spellings, with wildcards for variants); Discord's own English word lists cover the rest.

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
/feed add bluesky account:@jay.bsky.team post_in:#social
/feed list
/feed test number:1
/feed edit number:1 message:{role} new drop from {author}: {title} {url}
/feed remove number:1
/feed resume number:1
```

YouTube, RSS and Bluesky need no API key (YouTube's public channel feed and Bluesky's public AppView are read). Twitch and Kick need free developer-app credentials on the host: `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` (dev.twitch.tv) and `KICK_CLIENT_ID` + `KICK_CLIENT_SECRET` (kick.com/settings/developer); without them `/feed add twitch|kick` says so.

Placeholders: `{role}` `{author}` `{title}` `{url}` `{game}` `{viewers}` `{server}`. Uploads and posts are checked every 5 minutes, streams every 2; up to 15 feeds per server; only items from the moment a feed is added are posted; a feed that fails 20 checks in a row pauses itself and says so in the log channel.

`/feed autopublish add channel:#announcements` publishes every post in an announcement channel to the servers following it (Discord allows 10 an hour per channel; ZARU keeps under it). ZARU needs **Manage Messages** there to publish other people's posts.

## Engagement

```
/sticky set message:Read the rules before posting! channel:#help
/sticky remove
/autothread add channel:#showcase
/community bump on ping:@Bumpers
/community anniversaries set channel:#general
```

`/setup welcomecard enabled:true` attaches a picture card (avatar, name, member number) to welcome messages; `/rank` shows a picture card with level, position and progress.

Tickets: `/ticket topics add name:Support emoji:🛠️` builds a topic menu for the panel (no topics = one button); every opener fills in a short reason pop-up that becomes the ticket's first message; inside a ticket staff can `/ticket add user`, `/ticket remove user`, `/ticket rename`, `/ticket transcript`, and `/ticket close reason:…`.

Scheduled posts (up to 10 per server; `{server}` and `{membercount}` are filled in):

```
/schedule add channel:#general message:Weekly game night tonight at 8! repeat:Weekly at:18:00 weekday:Friday
/schedule add channel:#rules message:Reminder: be kind. repeat:Daily at:09:00
/schedule list
/schedule send number:1
/schedule remove number:1
```

Times are UTC; hourly/6h/12h posts align to the `at` time (or 00:00).

A sticky note is re-posted at the bottom of its channel a few seconds after people write (one copy at a time). Auto-thread channels open a thread under every post, named after its first line (ZARU needs **Create Public Threads**). Bump reminders watch for DISBOARD's "Bump done", react ⏰ and remind two hours later in that channel. Anniversaries run at 08:00 UTC and name members who joined on that date a year or more ago (servers up to 5000 members).

## Auto-responses, confessions, role menus

```
/autoresponse add trigger:server ip reply:Play at play.example.net, {user}! match:contains
/confess channel channel:#confessions   ·   /confess post message:…   ·   /confess lookup number:12
/setup welcomedm message:Welcome to {server}, {username}! Read #rules first.
/rolemenu title:Pick your games role1:@Valorant role2:@Minecraft role3:@BGMI max_picks:3
```

Auto-responses answer once per 10 s per channel; confessions are anonymous to members (one per 5 minutes) but staff can look a number up; the role menu is a dropdown that adds the picked roles and removes the unpicked ones.

## Activity stats and events

```
/stats days:30
/community digest set channel:#staff-room
/community events set channel:#events ping:@Events
```

Messages, joins, leaves and voice minutes are counted per day (kept 90 days); `/stats` shows totals plus the most active members and busiest channels, and the digest posts the last week every Monday at 08:00 UTC. With an events channel set, new Discord scheduled events are announced when created and everyone is reminded 30 minutes before each one starts.

## Applications and modmail

```
/applyform create name:staff review_channel:#applications question1:Why do you want to join the team? question2:How active are you? role:@Trial Staff
/applyform panel name:staff channel:#apply-here
/applyform list · /applyform pending · /applyform open|close|delete name:staff
/apply name:staff
/modmail set channel:#modmail ping:@Moderators
/modmail open user:@someone message:Hi, quick question about your post
/modmail close reason:Sorted, thanks
/modmail block user:@spammer · /modmail unblock user:@spammer · /modmail off
```

Applications are answered in a pop-up (up to five questions), posted in the review channel with **Accept** / **Deny** buttons (deny asks for an optional reason), and the applicant is told by DM; accepting can grant a role. One pending application per person per form.

Modmail: a member DMs ZARU and a thread opens in the staff-only modmail channel (members in several ZARU servers pick which one); staff replies in the thread are delivered as DMs, lines starting with `//` stay private, `/modmail close` ends and archives the thread. Make the modmail channel staff-only.

## Live modules

- **Levels** — `/rank` `/levels` `/level` `/eco` `/rep` `/birthday` (chat XP + coins) · voice XP (`/level voicexp`, `/levels board:Voice time`, voice time on `/rank`) · shop (`/shop list|buy|add|remove`, `/shop inventory`) · `/gamble slots|coinflip` · picture rank card on `/rank` · `/level noxp add|remove|list` · `/level multiplier set|clear|list`
- **Tickets / RR / giveaways** — `/ticket` `/reactionrole` `/giveaway` `/verify` (topic menu, reason pop-up, `/ticket add|remove|rename|transcript|topics`)
- **Server tools** — `/starboard` `/logging` `/voicehub` `/counting` `/serverstats` `/embed` `/tag` `/afk` `/snipe` `/poll` `/reminder` `/suggest` `/sticky` `/autothread`  `/schedule` `/applyform` `/apply` `/modmail` `/highlight` (DM when a word you chose is said) `/stats` `/community digest|events|anniversaries|bump` `/autoresponse` `/confess` `/setup welcomedm` `/rolemenu`
- **Gaming** — `/lfg` `/fun`
- **Music** — `?play` `/play` `/playnext` `/playskip` `/mix` `/search` `/skip` `/queue` `/reconnect` (famous full tracks, public Spotify playlists, autoplay, Not this; reconnect if voice goes silent)
- **Alerts** — `/feed` (YouTube uploads, RSS/Atom, Twitch and Kick live) · `/feed autopublish`

## Phase roadmap

1. Foundation ✅  
2. Moderation ✅  
3. Community / welcome / invites / templates ✅  
4. Levels / economy / tickets / giveaways / starboard ✅  
5. Gaming ✅  
6. Music — YouTube + Spotify playback ✅  
7. Alerts — YouTube / RSS / Twitch / Kick notifications, auto-publish ✅
