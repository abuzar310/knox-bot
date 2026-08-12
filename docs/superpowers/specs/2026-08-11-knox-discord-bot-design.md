# Knox Discord Bot — Design Spec (Phase 1 Foundation)

**Date:** 2026-08-11  
**Status:** Approved — Phase 1 implementation in progress  
**Product:** Knox — multi-server master Discord bot + web dashboard

## Goal

Ship the spine of a production Knox bot: TypeScript monorepo, discord.js slash-command framework, module loader, PostgreSQL guild config, Discord-OAuth dashboard, Docker deploy on Oracle Always Free. Later modules (moderation, gaming, music, levels) plug in without a rewrite.

## Non-goals (Phase 1)

- Full moderation suite, music playback, leveling economy, LFG queues
- Public bot listing / SaaS billing (schema may reserve a `premium` flag only)
- Prefix commands
- Looking or smelling like a generic GitHub “v14 multipurpose template”

## Locked decisions

| Area | Choice |
|------|--------|
| Runtime | Node.js + TypeScript |
| Bot library | discord.js v14 |
| Layout | pnpm + Turborepo monorepo |
| Database | PostgreSQL + Drizzle ORM |
| Dashboard | Next.js App Router + Discord OAuth2 |
| Hosting | Oracle Cloud Always Free VPS + Docker Compose |
| Scope mode | Multi-guild from day one |
| Commands | Slash-only |
| Brand | Knox-owned embeds, copy, dashboard UI (not template defaults) |

## Architecture

```
apps/bot          discord.js client, command/event/module loaders
apps/web          Next.js Knox Dashboard (OAuth, guild settings)
packages/db       Drizzle schema, migrations, DB client
packages/config   Zod schemas for guild settings + module flags
packages/shared   Shared types, constants, permission enums
```

**Runtime topology (Docker Compose):**

1. `postgres` — persistent volume  
2. `bot` — gateway connection, reads/writes Postgres  
3. `web` — dashboard + server actions / route handlers  

Bot and web share one database. Dashboard writes config; bot hot-reloads via Postgres `LISTEN/NOTIFY` on channel `knox_guild_config` so toggles apply in seconds without restarting the bot.

## Bot internals

### Module system

Each module is a folder under `apps/bot/src/modules/<id>/` exporting:

- `id`, `name`, `description`
- `defaultEnabled: boolean`
- `commands[]`, `events[]`
- optional `onLoad` / `onUnload`

Phase 1 live modules:

- `core` — `/ping`, `/help`, `/modules`, `/config` (view)
- `admin` — permission role mapping helpers for guild admins

Phase 1 stubs (module metadata + `defaultEnabled: false` only; **no slash commands registered** until their phase):

- `moderation`, `gaming`, `music`, `levels`

### Permissions (evaluated in order)

1. Discord channel/user permission bits required by the command  
2. Knox rank mapped from Discord roles: `owner` → `admin` → `mod` → `dj` → `member`  
3. Per-command guild override (allow/deny role or user) — **schema in Phase 1, dashboard UI in a later phase**  
4. Module enabled flag for that guild  

Guild owner (Discord) always bypasses Knox rank checks except hard safety blocks (e.g. cannot nuke config without Manage Guild).

### Guild data model (Drizzle)

- `guilds` — `id` (snowflake PK), `name`, `icon`, `ownerId`, `joinedAt`, `premium` (bool default false)  
- `guild_settings` — `guildId` PK/FK, `locale`, `embedColor`, `logChannelId`, `moduleFlags` (jsonb), `updatedAt`  
- `guild_permission_roles` — `guildId`, `rank` enum, `roleId`  
- `command_overrides` — `guildId`, `commandName`, `allowType` (`role`|`user`), `allowId`, `effect` (`allow`|`deny`)  
- `audit_logs` — dashboard/bot admin actions (who changed what)

### Command UX

- Knox embed color from guild settings (default brand color `#E8FF47` on near-black `#0B0F0C` — distinct from purple-template look)  
- User-facing failures: ephemeral  
- Staff failures with detail: ephemeral + optional log channel  
- Structured logs via `pino`

### Secrets

Env only: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `DATABASE_URL`, `SESSION_SECRET`. Never commit `.env`.

## Dashboard

### Auth

- Discord OAuth2 (`identify`, `guilds`) via **Auth.js (NextAuth)** Discord provider  
- Encrypted session cookies  
- Guild access: user must have `MANAGE_GUILD` (or be owner) on that Discord guild **and** Knox must be in the guild  

### Phase 1 pages

1. **Login**  
2. **Server picker** — mutual guilds where user can manage + bot is present; invite CTA if bot missing  
3. **Overview** — module toggles, embed color, log channel  
4. **Permissions** — map Discord roles → Knox ranks  

No public marketing site in Phase 1 beyond a minimal landing that routes to login.

### Data flow

1. Admin toggles `moderation` off in dashboard  
2. `web` updates `guild_settings.moduleFlags`  
3. `web` emits NOTIFY `knox_guild_config` with guild id  
4. `bot` invalidates cache for that guild and reloads settings  
5. Later phases register that module’s slash commands globally (or per-guild sync) and gate runtime with module flags

Phase 1 command registration: global slash commands for `core` + `admin` only. Dashboard still stores module flags for stubs so toggles are ready when those modules ship.

## Error handling & reliability

- Interaction handler wraps every command; unknown errors → generic ephemeral + error id logged  
- DB outage: bot replies “Knox is degraded” for config-dependent commands; ping still works  
- Discord API rate limits: use discord.js built-in handlers; backoff on register  
- Process manager in Docker: restart on crash  
- Health: bot exposes internal `/healthz` (HTTP on localhost) for Compose healthcheck; web uses Next health route  

## Testing (Phase 1)

- Unit: permission resolver, Zod guild settings parse, module flag merge  
- Integration: Drizzle migrations against test Postgres  
- Manual: invite bot → OAuth login → toggle setting → confirm bot reads new color/log channel  

No full E2E Discord gateway suite in Phase 1.

## Deploy (Oracle Always Free)

- Ubuntu image, Docker + Compose  
- Compose services: `postgres`, `bot`, `web`  
- **Caddy** reverse proxy for HTTPS once a domain points at the VPS (IP-only HTTP acceptable for first bring-up)  
- `pnpm build` in images; migrations run as a one-shot `db-migrate` service before bot/web start  
- Docs include Discord Developer Portal setup: app create, bot token, OAuth redirect, intents (**Guilds** + **Server Members Intent** for role maps)

## Roadmap after Phase 1

1. **Moderation** — warn/mute/kick/ban, cases, automod, mod log  
2. **Levels / friends** — XP, ranks, fun commands, Knox personality copy  
3. **Gaming** — roles, LFG, queues  
4. **Music** — Lavalink node + play/skip/queue (separate Compose service)  

Each ships as a module package behind the same loader and dashboard toggles.

## Project location

Repository root: `knox-bot/` under the current workspace (new project, not a template fork).

## Success criteria (Phase 1)

- Bot online in Knox + at least one second test guild  
- `/ping` and `/help` work  
- Dashboard login + guild overview saves embed color and module flags to Postgres  
- Bot reflects saved embed color on next `/help` without restart  
- `docker compose up` brings postgres + bot + web healthy on a fresh VPS  
- Codebase structure ready to drop in `moderation` without touching the core loader
