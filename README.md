# traditional-medicine-notifier-bot

Telegram bot providing **reference information on Chinese (TCM) and Tibetan
traditional medicine** — centered on herbs and remedies — together with
**extended notification functionality**: user-scheduled recurring reminders and
opt-in topic subscriptions / daily tips. UI is **Russian only**. Content is
**markdown files in this repo** — no external CMS, no runtime AI.

> ⚠️ **Informational only.** This bot is an educational reference about
> traditional-medicine practices. It does **not** provide medical advice,
> diagnosis, or treatment. Every herb page carries this disclaimer.

## Status

🚧 **Skeleton.** The scaffold, architectural seams, types, and DB migration
framework are in place; most feature bodies are intentional `TODO` stubs.
`typecheck` / `lint` / `build` / `test` are green. Booting needs a real
`BOT_TOKEN`.

## Features (target)

- **Herb / remedy reference** — browse and search a markdown corpus of Chinese
  and Tibetan herbs with properties, uses, and cautions.
- **User-scheduled reminders** — users create their own recurring reminders
  (e.g. take a remedy at 08:00 & 20:00). Solicited — delivered on time, not
  subject to the proactive daily cap.
- **Topic subscriptions / daily tips** — opt-in feeds (e.g. herb-of-the-day,
  per-category digests) delivered on a schedule, routed through a proactive
  push budget (≤1 proactive push/user/day).
- **Donations** — voluntary Telegram Stars tipping.
- **Daily DB backups** — SQLite snapshot with retention, bind-mounted to host.
- **Content index** — pre-computed cross-file lookup under `content/.index/`,
  CI-enforced.

## Stack

Node 22 · TypeScript 6 strict · Telegraf 4.16 (polling) · better-sqlite3 (WAL) ·
pino · node-cron · Vitest · ESLint flat config · Prettier · Husky · Docker
Compose · GitHub Actions.

## Architecture

```
src/
  bot/             # Telegraf adapter: commands, middleware, messages, keyboards, payments
  content/         # Markdown loader + validation + index builders (boot-time only)
  notifications/   # PURE domain core: recurrence math, due-selection, types
  db/              # better-sqlite3 connection, versioned schema, repositories
  services/        # Notifier interface, dispatch crons, push budget, DB backups
  utils/           # retry (Telegram 429), datetime (tz-aware day/hour)
  config.ts        # typed env var config
  logger.ts        # pino structured logging
  index.ts         # boot entry

content/
  herbs/{chinese,tibetan}/*.md   # herb / remedy reference cards
  categories/*.md                # subscribable topic categories
  tips/*.md                      # daily-tip pool
  .index/                        # generated, committed cross-file lookup
```

**Two notification paths**, both behind the `Notifier` seam (ADR 003):

- **Solicited** (`services/reminder-dispatch.ts`) — a frequent cron tick
  delivers due user-scheduled reminders, advancing each via the pure
  `notifications/recurrence.ts`. No daily cap.
- **Proactive** (`services/subscription-dispatch.ts`) — daily tips / digests to
  subscribers, gated by `services/notification-budget.ts` (≤1/user/day,
  ADR 004).

See [`docs/architecture/architecture.md`](docs/architecture/architecture.md).

## Setup

### Prerequisites

- Node.js 22+
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))

### Install & run

```bash
npm install
cp .env.example .env      # set BOT_TOKEN and BOT_USERNAME
npm run dev               # tsx watch src/index.ts
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `BOT_TOKEN` | yes | — | Telegram bot token |
| `BOT_USERNAME` | yes | — | Bot @username (no `@`), used for deep links |
| `DB_PATH` | no | `./data/tm-bot.db` | SQLite database path |
| `CONTENT_DIR` | no | `./content` | Markdown content root |
| `LOG_LEVEL` | no | `info` | `trace`/`debug`/`info`/`warn`/`error`/`fatal` |
| `TIMEZONE` | no | `UTC` | Single timezone for schedules + day boundary |
| `REMINDER_TICK_CRON` | no | `* * * * *` | Solicited-reminder dispatch tick |
| `DAILY_TIP_CRON` | no | `0 9 * * *` | Proactive daily-tip dispatch |
| `BACKUP_DIR` | no | `/var/backups/traditional-medicine-notifier-bot` | In-container backup path |
| `HOST_BACKUP_DIR` | no | same | Host dir bind-mounted to `BACKUP_DIR` |
| `ADMIN_TELEGRAM_IDS` | no | — | Comma-separated admin Telegram ids |

## Scripts

```bash
npm run dev                  # tsx watch src/index.ts
npm run build                # tsc → dist/
npm start                    # node dist/index.js
npm test                     # vitest run
npm run typecheck            # tsc --noEmit
npm run lint                 # eslint src/
npm run content:index        # Regenerate content/.index/
npm run content:index:check  # CI guard: validate + drift check
```

## Production (Docker)

```bash
docker compose up -d --build
docker compose logs --tail 50
```

## Project rules

- **Russian UI only** — all user-facing strings live in `src/bot/messages.ts`.
- **Content is read-only at runtime** — markdown loaded once at boot; the DB
  stores only user state. Content `id`s are stable join keys.
- **Informational, not medical advice** — every herb page ends with the
  disclaimer; `/start` and `/help` repeat it.
- **Portability discipline** — Telegraf confined to `src/bot/`; domain layers
  stay framework-free (ADR 003).

See [`CLAUDE.md`](CLAUDE.md) for the full rule set and commit conventions.

## License

[MIT](LICENSE) © 2026 Igor Konovalov
