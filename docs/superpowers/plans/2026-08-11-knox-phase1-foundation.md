# Knox Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Knox Phase 1 — TypeScript monorepo with discord.js bot, Next.js dashboard (Discord OAuth), PostgreSQL/Drizzle guild config, module loader, and Docker Compose deploy path.

**Architecture:** pnpm + Turborepo monorepo. `apps/bot` and `apps/web` share `packages/db`, `packages/config`, and `packages/shared`. Dashboard writes guild settings; bot hot-reloads via Postgres `LISTEN/NOTIFY` on `knox_guild_config`.

**Tech Stack:** Node.js 22+, TypeScript 5.5+, discord.js 14, Next.js 15 App Router, Auth.js (NextAuth v5), PostgreSQL 16, Drizzle ORM, Zod, pino, Docker Compose, Vitest, pnpm, Turborepo.

## Global Constraints

- Slash commands only (no prefix commands)
- Multi-guild from day one
- Secrets only via env (never commit `.env`)
- Default brand: embed `#E8FF47`, background `#0B0F0C`
- Phase 1 live modules: `core`, `admin` only; stubs `moderation`, `gaming`, `music`, `levels` (metadata, no commands)
- Command override UI deferred; `command_overrides` table still created
- Auth.js Discord provider for dashboard
- Caddy for HTTPS later; Compose must run without it for first bring-up
- Do not look like a generic public Discord bot template
- Spec: `docs/superpowers/specs/2026-08-11-knox-discord-bot-design.md`

---

## File map

```
knox-bot/
  package.json
  pnpm-workspace.yaml
  turbo.json
  tsconfig.base.json
  .gitignore
  .env.example
  docker-compose.yml
  Dockerfile.bot
  Dockerfile.web
  README.md
  apps/bot/
    package.json
    tsconfig.json
    src/index.ts
    src/env.ts
    src/client.ts
    src/logger.ts
    src/health.ts
    src/load/commands.ts
    src/load/events.ts
    src/load/modules.ts
    src/permissions/resolve.ts
    src/config/guild-cache.ts
    src/config/listen.ts
    src/interactions/router.ts
    src/modules/core/index.ts
    src/modules/core/commands/ping.ts
    src/modules/core/commands/help.ts
    src/modules/core/commands/modules.ts
    src/modules/core/commands/config.ts
    src/modules/admin/index.ts
    src/modules/admin/commands/set-rank-role.ts
    src/modules/moderation/index.ts
    src/modules/gaming/index.ts
    src/modules/music/index.ts
    src/modules/levels/index.ts
    src/register-commands.ts
  apps/web/
    package.json
    tsconfig.json
    next.config.ts
    src/app/layout.tsx
    src/app/page.tsx
    src/app/globals.css
    src/app/api/auth/[...nextauth]/route.ts
    src/app/login/page.tsx
    src/app/dashboard/page.tsx
    src/app/dashboard/[guildId]/page.tsx
    src/app/dashboard/[guildId]/permissions/page.tsx
    src/app/api/health/route.ts
    src/auth.ts
    src/lib/db.ts
    src/lib/guilds.ts
    src/lib/notify.ts
    src/components/...
  packages/shared/
    package.json
    src/index.ts
    src/ranks.ts
    src/brand.ts
    src/modules.ts
  packages/config/
    package.json
    src/index.ts
    src/guild-settings.ts
    src/guild-settings.test.ts
  packages/db/
    package.json
    drizzle.config.ts
    src/index.ts
    src/client.ts
    src/schema.ts
    src/migrate.ts
```

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `README.md`

**Interfaces:**
- Consumes: none
- Produces: workspace root that can `pnpm install` once packages exist

- [ ] **Step 1: Write root workspace files**

`package.json`:
```json
{
  "name": "knox-bot",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev --parallel",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "db:generate": "pnpm --filter @knox/db generate",
    "db:migrate": "pnpm --filter @knox/db migrate"
  },
  "devDependencies": {
    "turbo": "^2.3.3",
    "typescript": "^5.7.2"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] }
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

`.gitignore`: `node_modules`, `.env`, `.env.local`, `dist`, `.next`, `coverage`, `.turbo`, `*.log`

`.env.example`:
```env
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/callback/discord
DATABASE_URL=postgresql://knox:knox@localhost:5432/knox
SESSION_SECRET=change-me-to-a-long-random-string
AUTH_SECRET=change-me-to-a-long-random-string
NEXTAUTH_URL=http://localhost:3000
BOT_HEALTH_PORT=3080
```

- [ ] **Step 2: Write README with Discord Developer Portal setup** (create app, bot token, OAuth redirect, Guilds + Server Members Intent, invite URL with `applications.commands` + `bot`)

- [ ] **Step 3: Verify** — files exist; no install yet until packages are added

---

### Task 2: `@knox/shared`

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/ranks.ts`, `packages/shared/src/brand.ts`, `packages/shared/src/modules.ts`, `packages/shared/src/index.ts`

**Interfaces:**
- Produces:
  - `KnoxRank = "owner" | "admin" | "mod" | "dj" | "member"`
  - `RANK_ORDER: Record<KnoxRank, number>` (owner=100 … member=0)
  - `hasMinRank(userRank: KnoxRank, required: KnoxRank): boolean`
  - `BRAND = { embedColor: 0xe8ff47, embedColorHex: "#E8FF47", bg: "#0B0F0C", name: "Knox" }`
  - `MODULE_IDS = ["core","admin","moderation","gaming","music","levels"] as const`
  - `ModuleId` type
  - `DEFAULT_MODULE_FLAGS: Record<ModuleId, boolean>` — core/admin true; others false

- [ ] **Step 1: Implement package + export barrel**

- [ ] **Step 2: Add Vitest test for `hasMinRank`** in `packages/shared/src/ranks.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { hasMinRank } from "./ranks.js";

describe("hasMinRank", () => {
  it("allows admin for mod requirement", () => {
    expect(hasMinRank("admin", "mod")).toBe(true);
  });
  it("denies member for mod requirement", () => {
    expect(hasMinRank("member", "mod")).toBe(false);
  });
});
```

- [ ] **Step 3: Run** `pnpm --filter @knox/shared test` — Expected: PASS

---

### Task 3: `@knox/config` Zod schemas

**Files:**
- Create: `packages/config/package.json`, `packages/config/tsconfig.json`, `packages/config/src/guild-settings.ts`, `packages/config/src/guild-settings.test.ts`, `packages/config/src/index.ts`

**Interfaces:**
- Consumes: `ModuleId`, `DEFAULT_MODULE_FLAGS` from `@knox/shared`
- Produces:
  - `moduleFlagsSchema` — z.record of module ids to boolean, defaults merged
  - `guildSettingsSchema` — `{ locale: z.string().default("en"), embedColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#E8FF47"), logChannelId: z.string().nullable().default(null), moduleFlags: moduleFlagsSchema }`
  - `parseGuildSettings(input: unknown)` → parsed settings with defaults

- [ ] **Step 1: Write failing tests** for default merge and invalid color rejection

- [ ] **Step 2: Implement schemas**

- [ ] **Step 3: Run** `pnpm --filter @knox/config test` — Expected: PASS

---

### Task 4: `@knox/db` Drizzle schema + client

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/drizzle.config.ts`, `packages/db/src/schema.ts`, `packages/db/src/client.ts`, `packages/db/src/migrate.ts`, `packages/db/src/index.ts`

**Interfaces:**
- Produces tables matching spec: `guilds`, `guild_settings`, `guild_permission_roles`, `command_overrides`, `audit_logs`
- `createDb(connectionString: string)` → `{ db, pool }`
- `notifyGuildConfig(pool, guildId: string): Promise<void>` — `NOTIFY knox_guild_config, guildId`
- migrate script runnable via `pnpm --filter @knox/db migrate`

**Schema notes:**
- `guilds.id` text PK (snowflake)
- `guild_settings.guildId` PK/FK → guilds
- `guild_permission_roles`: unique `(guildId, rank)` where rank is enum text
- `command_overrides`: id serial/uuid, guildId, commandName, allowType, allowId, effect
- `audit_logs`: id, guildId, actorId, action, payload jsonb, createdAt

- [ ] **Step 1: Implement schema + client + migrate entry**

- [ ] **Step 2: Generate migration** with `drizzle-kit generate` (requires DATABASE_URL or drizzle.config dialect only)

- [ ] **Step 3: Verify TypeScript build** `pnpm --filter @knox/db build`

---

### Task 5: Bot core — env, client, loaders, interaction router

**Files:**
- Create: all `apps/bot` files listed in file map except module command bodies (stubs ok first)

**Interfaces:**
- Consumes: `@knox/db`, `@knox/config`, `@knox/shared`
- Produces:
  - `KnoxClient extends Client` with `modules: Map<string, KnoxModule>`, `commands: Collection<string, KnoxCommand>`
  - `KnoxCommand = { data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder, execute(interaction, ctx): Promise<void>, requiredRank?: KnoxRank, guildOnly?: boolean }`
  - `KnoxModule = { id, name, description, defaultEnabled, commands, events?, onLoad?, onUnload? }`
  - `loadModules(dir): Promise<KnoxModule[]>`
  - `resolveKnoxRank(member, permissionRows): KnoxRank`
  - `canRunCommand({ member, command, settings, permissionRows, overrides }): { ok: true } | { ok: false, reason: string }`
  - Interaction router: defer/handle errors with ephemeral message + error id logged via pino

- [ ] **Step 1: Write unit tests for `resolveKnoxRank` and `canRunCommand`** in `apps/bot/src/permissions/resolve.test.ts`

- [ ] **Step 2: Implement permissions + loaders + router + health HTTP on `BOT_HEALTH_PORT`**

- [ ] **Step 3: Implement `core` + `admin` commands and stub modules**

- [ ] **Step 4: Implement guild cache + LISTEN/NOTIFY subscriber**

- [ ] **Step 5: `register-commands.ts` script** — registers global commands from enabled-by-default live modules (`core`, `admin`)

- [ ] **Step 6: Run bot unit tests** `pnpm --filter @knox/bot test` — Expected: PASS

---

### Task 6: Web dashboard — Auth.js + guild pages

**Files:**
- Create: all `apps/web` files in file map

**Interfaces:**
- Consumes: `@knox/db`, `@knox/config`, `@knox/shared`
- Produces:
  - Auth.js Discord provider; session includes Discord user id + access token for guild list
  - Server helpers: `getManageableGuilds(accessToken)`, `ensureGuildRow(guild)`, `getGuildSettings(guildId)`, `updateGuildSettings(guildId, patch)` + NOTIFY
  - Pages: `/`, `/login`, `/dashboard`, `/dashboard/[guildId]`, `/dashboard/[guildId]/permissions`
  - `/api/health` → `{ ok: true }`
  - Knox visual: near-black bg `#0B0F0C`, accent `#E8FF47`, no purple template aesthetic

- [ ] **Step 1: Scaffold Next.js app with Auth.js Discord**

- [ ] **Step 2: Implement server guild helpers + settings mutations with NOTIFY**

- [ ] **Step 3: Build dashboard UI pages (server picker, overview toggles, permissions role map)**

- [ ] **Step 4: Verify** `pnpm --filter @knox/web build` succeeds

---

### Task 7: Docker Compose + local verify

**Files:**
- Create: `docker-compose.yml`, `Dockerfile.bot`, `Dockerfile.web`, optional `Caddyfile` stub documented in README

**Interfaces:**
- Services: `postgres`, `db-migrate` (one-shot), `bot`, `web`
- Healthchecks: postgres `pg_isready`; bot `wget/curl localhost:3080/healthz`; web `/api/health`

- [ ] **Step 1: Write Dockerfiles (pnpm fetch/build multi-stage)**

- [ ] **Step 2: Write compose file with volume for postgres**

- [ ] **Step 3: Document Oracle Always Free bring-up in README**

- [ ] **Step 4: Local verify without Discord token where possible:**
  - `pnpm install`
  - `pnpm test`
  - `pnpm build`
  - `docker compose up -d postgres` + migrate (if Docker available)

---

### Task 8: End-to-end checklist (manual)

**Files:**
- Modify: `README.md` with checklist

- [ ] **Step 1: Add manual E2E checklist to README**
  1. Create Discord app + copy secrets into `.env`
  2. `pnpm db:migrate`
  3. `pnpm --filter @knox/bot register` (or `tsx src/register-commands.ts`)
  4. Start bot + web
  5. Invite bot; `/ping` + `/help`
  6. OAuth login; set embed color; confirm `/help` uses new color without bot restart

- [ ] **Step 2: Mark Phase 1 complete when automated tests + builds pass** (manual Discord steps require user's token)

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| Monorepo bot/web/db/config/shared | 1–6 |
| Module loader + stubs | 5 |
| Permissions ranks + overrides schema | 4–5 |
| Guild settings + NOTIFY | 4–6 |
| Dashboard OAuth + pages | 6 |
| Docker / Oracle path | 7 |
| Tests (unit permission/zod) | 2,3,5 |
| No music/mod features in P1 | enforced via stubs only |

## Execution note

User preferred no choice menus: default to **inline execution** in this session using executing-plans. Skip git commits unless the user explicitly asks to commit.
