# 2026-11-09 — Zaru Launcher handoff

Owner: Mohammed Abuzar (`abuzar310`, Asia/Calcutta). This file is the handoff. The launcher and the website are not this Knox repo.

## What this is

A personal, non-commercial Minecraft launcher named **Zaru Launcher**, forked from Millida (`github.com/millida/launcher`, GPL-3.0-only, Tauri 2 + React + Rust). Abuzar has a private DM permission from Millida: for himself and friends, do not sell it, do not list it as a public Millida product. Use Millida’s backend, including Microsoft login and the Discord application id.

Two git repos, both already on GitHub:

| Repo | Local path | Branch | Tip |
| --- | --- | --- | --- |
| `abuzar310/zaru-launcher` | `/tmp/zaru-launcher` | `zaru-root` | `4955354` Point future installs at a Zaru update feed. |
| `abuzar310/zaru-site` | `/tmp/zaru-site` | `main` | `fed79ca` Redesign the site around a dark royal amethyst look. |

Live site: `https://zaru-launcher.vercel.app`  
Vercel project `prj_5LeUlU0AGLQsIYblnkRyA9PqIuVb`, team `team_w2icWaw5XU1lDj3W7yhmE3xd`.  
Discord: `https://discord.gg/Tfd7y4FjP`  
Version pinned at `99.0.0` so Millida’s updater does not replace the build. Product name `Zaru Launcher`. Bundle id in `tauri.conf.json` is `com.zaru.launcher`. The data folder is still `net.millida.launcher`.

Knox (`abuzar310/knox-bot`, this repo) is a separate Discord bot. Do not mix launcher commits into it. This file is only the paper trail.

## Shipped

Launcher, newest first:

- `4955354` The next installer checks `https://zaru-launcher.vercel.app/updates/latest.json` and trusts a Zaru minisign public key in `tauri.conf.json`. The private key is gitignored at `.keys/zaru-updater.key` (empty password) and is not in git. `createUpdaterArtifacts` stays false, so a normal build does not need the key. A failed check, including a 404, stays soft. The “download the installer” fallback in the updater and the broken-install page opens the Zaru site.
- `bd97f07` App icon and in-app mark are the crowned grass-block Z. Source is the rounded app icon Abuzar sent (black rounded square, gold crown, purple Z). It is `src-tauri/icons/icon.ico`, `icon.png`, the Windows square logos, `public/zaru-logo.png`, and `public/app-icons/default.png`. Title bar, boot, login, welcome, about, and onboarding use `/zaru-logo.png`. The website was not changed. The old green pixel mark stays only as the Milli character geometry in `milliMascot.ts`.
- `d564871` Visible UI says Zaru. `src/i18n/core.ts` `brandVisible()` rewrites Millida / Milli / Милли / Миллида on text that goes through `t()`, `tx()`, and `useT()`. URLs (`millida.net`, `millida.host`) and path segments (`D:\Millida`, `/home/me/Millida`) stay. Hardcoded labels (settings skin source, cape name, dialog titles, MCRU / MetaLabs lines, PvP server label, icon name, shop PLUS) say Zaru. New PvP builds are `Zaru PvP <version>`. An existing `Millida PvP` profile is reused. Discord “Download launcher” opens the Zaru site. Corner mark `public/millida-logo.svg` is a purple Z (file name kept). Picking a whole drive creates a `Zaru` folder.
- `485d8f7` Discord button and lobby promo use `https://discord.gg/Tfd7y4FjP`.
- `d6ccb1e` Launcher theme is the neon magenta from Abuzar’s screenshot: `#ba28bb` / `#d32ed3` in `src/styles/02-kit.css` and `12-pixel.css`. Default accent id `purple`.
- `8c4c00f` / `8420ec7` Window title, binaries `zaru-launcher` / `zaru-launcher.exe`, game process stem `ZaruMinecraft`. Old stems `MillidaMinecraft` and `MillidaLauncher` stay so a game already running is still detected.
- `0b8bafa` First screen is license or offline, not a Millida sign-in gate. Millida login stays available later for friends, skins, and Millida servers.

Site, newest first:

- `fed79ca` Royal amethyst page. Tokens: `#10091C`, `#170E24`, `#24113D`, `#2D1945`, `#7546C8`, `#B99AE8`, `#F7F0FF`, `#B7A9C8`. Headline “Minecraft, ready to play.” Windows and Linux only. Real screenshots in `shots/`. FAQ mentions the unsigned SmartScreen warning.
- Earlier site commits published the exe and deb and pointed Discord at the Zaru invite.

## Do not change

These are Millida’s protocol. Renaming them breaks accounts, skins, or joins.

- API host `api.millida.net`
- Deep link `millida://`
- Protocol tags `millida-launcher-ui/1` and `millida-launcher-i18n/1`
- HTTP User-Agent `MillidaLauncher/99.0.0 (+https://millida.net)`
- Data directory `net.millida.launcher`
- Vault / client salt and Microsoft client id env `MILLIDA_MS_CLIENT_ID`
- Discord application id `1530764069965922354` (override only with `MILLIDA_DISCORD_APP_ID`)
- Profile links `https://millida.net/u/…` and join links `https://millida.net/join?…`
- Skin provider name `Millida` inside CustomSkinAPI config
- Copyright line `© 2026 Millida (ИП Веселов Никита Николаевич)`
- Translation **keys** (Russian source strings). Change what the player reads in `brandVisible`, not the keys. A renamed key drops out of every locale file and the coverage test fails.

`milliError()` still matches the server’s own words (`сессия millida`, `milli_limit`). That matcher is not a label.

## Open

The website installers are older than `4955354`. Friends who download today still see Millida in the app UI, and those copies cannot receive a Zaru update: they trust Millida’s key and Millida’s update URLs. A new Windows NSIS exe and Linux `.deb` have to be built from `zaru-root` at `4955354` or later, copied into `zaru-site/downloads/`, committed, and deployed. Only that build, and later ones, can take an automatic update.

The site does not have `updates/latest.json` yet. Leave it missing until there is a real newer build (`99.0.1` or higher). Then Claude publishes that file. Deb installs look up `linux-x86_64-deb` before `linux-x86_64`, so include `linux-x86_64` at least. Sign the installer with the gitignored key, not with a key stored in this file:

```bash
TAURI_SIGNING_PRIVATE_KEY_PATH=.keys/zaru-updater.key \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD= \
bunx tauri signer sign path/to/installer
```

Example manifest, signatures filled from the `.sig` files:

```json
{
  "version": "99.0.1",
  "notes": "Zaru update",
  "pub_date": "2026-11-10T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<contents of the .sig>",
      "url": "https://zaru-launcher.vercel.app/downloads/Zaru.Launcher_99.0.1_x64-setup.exe"
    },
    "linux-x86_64": {
      "signature": "<contents of the .sig>",
      "url": "https://zaru-launcher.vercel.app/downloads/Zaru.Launcher_99.0.1_amd64.deb"
    }
  }
}
```

- Windows from Linux: `cargo-xwin`, target `x86_64-pc-windows-msvc`. MSVC SDK cache was at `/tmp/xwin-cache`. Do not run the Windows and Linux builds at the same time; this VM runs out of memory.
- Linux: `bun run build:web:release` then `bun run tauri build --bundles deb`.
- Frontend must be rebuilt before the Rust bundle, or the UI change is not inside the binary.
- No macOS build. Abuzar asked to drop it.
- Do not mark offline as recommended. Do not reorder Licensed / Offline.
- Launcher color is magenta. Site color is royal amethyst. They were separate requests. Do not “match” them unless Abuzar asks.
- Installers are unsigned. The site already tells Windows users about SmartScreen.
- Code signing was discussed and not done. He has not bought a certificate.

## How to push

`git` is rewritten to `cursor[bot]`, which cannot push these repos. Push with the environment GitHub token and a clean config. Do not print the token. Do not put it in a file.

```bash
TOKEN=$(gh auth token)
GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null \
  git -C /tmp/zaru-launcher push \
  "https://x-access-token:${TOKEN}@github.com/abuzar310/zaru-launcher.git" \
  HEAD:zaru-root
```

Same shape for `/tmp/zaru-site` and `HEAD:main`. A GitHub token was pasted in an earlier turn. It is not in git. Do not copy it into a new chat.

## Where the visible rename lives

- `src/i18n/core.ts` — `brandVisible`, applied at the end of `translate()` and on the outermost `localizeCore()` result.
- `src/i18n/brand.test.ts` — addresses stay, labels change.
- Tests that assert a sentence the player sees (`apiError.test.ts`, `packUpdate.test.ts`, `milli.test.ts`, `repair.test.ts`) expect Zaru.
- Assistant bubbles in `src/components/milli/MilliDock.tsx` brand the assistant text only. The player’s own message is left as typed.
- Clip notification key `Последние {0} с · Zaru Clips` was added next to the old Millida Clips key in every locale file. The Rust notice is already Zaru because it does not pass through `t()`.
