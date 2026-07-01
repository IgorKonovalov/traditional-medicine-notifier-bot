# traditional-medicine-notifier-bot

Telegram bot providing **reference information on Tibetan traditional medicine**
— herbs, minerals and other materia medica, compound formulas, foods, and
long-form articles — together with **extended notification functionality**:
user-scheduled recurring reminders and on-demand / daily tips. UI is **Russian
only**. Content is **markdown files in this repo** — no external CMS, no runtime
AI.

> ⚠️ **Informational only.** This bot is an educational reference about
> traditional-medicine practices. It does **not** provide medical advice,
> diagnosis, or treatment. A disclaimer is shown on entry (`/start`, `/help`)
> and on the clinically sensitive **formula (составы)** card.

> **Tibetan-only surface (ADR 013).** The bot presents strictly as a *Tibetan*
> reference. Chinese (TCM) records remain authored in the repo and the content
> index but are hidden at runtime by a single content-load visibility gate
> (`src/content/visibility.ts`). Re-enabling them is a one-line flip, gated by
> deliberate choice.

## Status

**v1 feature-complete · private, pre-launch** (`v0.27.1`). The navigation shell,
the unified library (herbs/ingredients · formulas · foods · guides · integrated
search), the reminder-create wizard, the three notification paths, payments, and
DB backups are all built; `typecheck` / `lint` / `build` / `test` /
`content:index:check` are green. Booting needs a real `BOT_TOKEN`. Remaining
open work is a maintainability backlog — see [Roadmap](#roadmap).

## Content corpus

Loaded once at boot from `content/`, cross-indexed under `content/.index/`:

| Type | Count | Where |
|---|---|---|
| Herbs / ingredients (incl. minerals, resins, animal materia medica) | 37 | `content/herbs/` |
| Compound formulas (составы) | 149 | `content/combinations/` |
| Foods (structured, filterable) | 55 | `content/foods/` |
| Long-form guides (статьи) | 39 | `content/guides/` |
| Daily tips | 87 | `content/tips/` |
| Categories | 7 | `content/categories/` |

## Features

- **Library reference** — one 📚 Библиотека hub browsing herbs/ingredients (by
  tradition and category), compound formulas, foods, and long-form guides, with
  an integrated search across the corpus.
- **Foods** — a structured, queryable content type: browse by group or filter by
  which начало a food pacifies / by warmth band (ADR 012).
- **Compound formulas (составы)** — structured formula cards (nature,
  composition, member cross-links, cautions) rendered as rich Telegram HTML
  (ADR 011). Live behind a documented doctor-review sign-off (ADR 006).
- **Long-form guides (статьи)** — paginated articles delivered one page at a
  time (ADR 008).
- **User-scheduled reminders** — a create wizard for recurring reminders (e.g.
  take a remedy at 08:00 & 20:00), optionally linked to an ingredient or a
  formula, honouring a **per-user timezone** (ADR 015). Solicited — delivered on
  time, not subject to the proactive daily cap.
- **Daily / on-demand tips** — a совет дня surface plus a boot-time version
  broadcast of "what's new", both routed through the notification model below.
- **Donations** — voluntary Telegram Stars tipping.
- **Daily DB backups** — SQLite snapshot with retention, bind-mounted to host.
- **Content index** — pre-computed cross-file lookup under `content/.index/`,
  CI-enforced against drift.

## Stack

Node 22 · TypeScript 6 strict · Telegraf 4.16 (polling) · better-sqlite3 (WAL) ·
pino · node-cron · Vitest · ESLint flat config · Prettier · Husky · Docker
Compose · GitHub Actions. Package manager: **pnpm 11** (supply-chain cooldown +
build-script allowlist configured in `pnpm-workspace.yaml`).

## Architecture

```
src/
  bot/             # Telegraf adapter: commands, menu-router, messages, keyboards,
                   #   payments, render/ (anchor + HTML seam), session-store, notifier impl
  content/         # Markdown loader + validation + index builders + visibility gate (boot-time)
  notifications/   # PURE domain core: recurrence math, due-selection, types
  db/              # better-sqlite3 connection, versioned schema, repositories
  services/        # Notifier interface, dispatch crons, push budget, version announcer, DB backups
  utils/           # retry (Telegram 429), datetime (tz-aware day/hour), version
  config.ts        # typed env var config
  logger.ts        # pino structured logging
  index.ts         # boot entry

content/
  herbs/{chinese,tibetan}/*.md   # herb / ingredient reference cards (Chinese gated, ADR 013)
  combinations/*.md              # compound formulas (составы)
  foods/tibetan/*.md             # structured, filterable foods
  guides/tibetan/*.md            # long-form articles (статьи)
  categories/*.md                # topic categories
  tips/*.md                      # daily-tip pool
  .index/                        # generated, committed cross-file lookup
```

**Three notification paths**, all behind the `Notifier` seam (ADR 003) so no
Telegraf leaks into the domain:

- **Solicited** (`services/reminder-dispatch.ts`) — a frequent cron tick
  delivers due user-scheduled reminders, advancing each via the pure
  `notifications/recurrence.ts` in the owner's timezone (ADR 015). No daily cap.
- **Proactive** (`services/subscription-dispatch.ts`) — daily tips / digests,
  gated by `services/notification-budget.ts` (≤1 push/user/day, ADR 004).
- **Broadcast** (`services/version-announcer.ts`) — a boot-time "what's new"
  ping to users behind the current version, idempotent via
  `users.notified_version`, cap-exempt (ADR 010).

See [`docs/architecture/architecture.md`](docs/architecture/architecture.md) and
the ADRs in [`docs/adr/`](docs/adr/).

## Roadmap

The v1 user surface is complete. Open plans in [`docs/plans/`](docs/plans/) are a
**maintainability / hardening backlog**, not new features:

| # | Plan | Focus |
|---|---|---|
| 027 | pnpm supply-chain cooldown | dependency-resolution cooldown + build-script allowlist (ADR 016) |
| 028 | Test proactive budget gate | close the daily-cap test gap |
| 029 | Split oversized command modules | break up large `commands/*.ts` files |
| 030 | Centralize platform constants | de-duplicate Telegram limits / magic numbers |
| 031 | Extract callback + cron helpers | shared callback-data / cron-parsing utilities |

Round-2 content ideas live in
[`docs/plans/guide-backlog.md`](docs/plans/guide-backlog.md).

## Setup

### Prerequisites

- Node.js 22 (`.nvmrc` pins `22`; `engines` requires `>=22 <23`)
- pnpm 11 — `corepack enable` picks up the pinned `packageManager` version
- A Telegram account

### 1. Create the bot on Telegram

1. Open [@BotFather](https://t.me/BotFather) and send `/newbot`.
2. Give it a **display name** and a **username** ending in `bot`.
3. Copy the **HTTP API token** BotFather returns (`123456789:AAH...`).
4. Note the **username** you chose (without the leading `@`) — used for deep links.

The bot registers its own command list at boot (`setMyCommands`), so no manual
`/setcommands` step is required.

### 2. Find your numeric Telegram id (for admin commands)

Message [@userinfobot](https://t.me/userinfobot); it replies with your numeric
id. Put it in `ADMIN_TELEGRAM_IDS`.

### 3. Configure environment

```bash
cd traditional-medicine-notifier-bot
corepack enable
pnpm install
cp .env.example .env
```

Edit `.env` and set at minimum:

```ini
BOT_TOKEN=123456789:AAH...          # from BotFather (step 1)
BOT_USERNAME=tm_notifier_bot        # your bot username, no leading @
TIMEZONE=Europe/Belgrade            # IANA fallback zone for schedules
ADMIN_TELEGRAM_IDS=123456789        # your id from step 2 (optional)
```

Everything else has working defaults.

### 4. Run in development

```bash
pnpm run content:index   # build content/.index/ if not present
pnpm run dev             # tsx watch src/index.ts — hot reload
```

The bot uses **long polling** — no webhook, public URL, or TLS needed. Open your
bot in Telegram and send `/start`. The SQLite file is created automatically at
`DB_PATH` on first boot.

### 5. Verify the toolchain (optional)

```bash
pnpm run typecheck && pnpm run lint && pnpm test && pnpm run build
pnpm run content:index:check   # validates corpus + guards index drift
```

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `BOT_TOKEN` | yes | — | Telegram bot token |
| `BOT_USERNAME` | yes | — | Bot @username (no `@`), used for deep links |
| `DB_PATH` | no | `./data/tm-bot.db` | SQLite database path |
| `CONTENT_DIR` | no | `./content` | Markdown content root |
| `LOG_LEVEL` | no | `info` | `trace`/`debug`/`info`/`warn`/`error`/`fatal` |
| `TIMEZONE` | no | `Europe/Belgrade` | Fallback zone for schedules + day boundary (users pick their own) |
| `REMINDER_TICK_CRON` | no | `* * * * *` | Solicited-reminder dispatch tick |
| `DAILY_TIP_CRON` | no | `0 9 * * *` | Proactive daily-tip dispatch (evaluated in `TIMEZONE`) |
| `BACKUP_DIR` | no | `/var/backups/traditional-medicine-notifier-bot` | In-container backup path |
| `HOST_BACKUP_DIR` | no | same | Host dir bind-mounted to `BACKUP_DIR` |
| `ADMIN_TELEGRAM_IDS` | no | — | Comma-separated admin Telegram ids |

## Scripts

```bash
pnpm run dev                  # tsx watch src/index.ts
pnpm run build                # tsc → dist/
pnpm start                    # node dist/index.js
pnpm test                     # vitest run
pnpm run test:watch           # vitest (watch)
pnpm run test:coverage        # vitest run --coverage
pnpm run typecheck            # tsc --noEmit
pnpm run lint                 # eslint src/
pnpm run lint:fix             # eslint src/ --fix
pnpm run format               # prettier --write
pnpm run content:index        # Regenerate content/.index/
pnpm run content:index:check  # CI guard: validate + drift check
pnpm run content:review       # Rebuild doctor-facing formula review HTML (gitignored)
pnpm run content:members      # Backfill formula → ingredient member cross-links
```

## Production (Docker)

```bash
docker compose up -d --build
docker compose logs --tail 50
```

## Project rules

- **Russian UI only** — all user-facing strings live in `src/bot/messages.ts`.
- **Tibetan-only surface** — Chinese records are authored-but-gated (ADR 013).
- **Content is read-only at runtime** — markdown loaded once at boot; the DB
  stores only user state. Content `id`s are stable join keys.
- **Informational, not medical advice** — the disclaimer is scoped to `/start`,
  `/help`, and the formula card (ADR 006); framing stays descriptive elsewhere.
- **Portability discipline** — Telegraf confined to `src/bot/`; domain layers
  stay framework-free (ADR 003).

See [`CLAUDE.md`](CLAUDE.md) for the full rule set and commit conventions.

## License

[MIT](LICENSE) © 2026 Igor Konovalov
