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

🚧 **In development.** The architectural seams, content pipeline, DB layer,
notification dispatch (both paths), payments, and the existing slash commands are
implemented; `typecheck` / `lint` / `build` / `test` are green. Booting needs a
real `BOT_TOKEN`. The navigation shell and the richer UI surfaces (library,
guides, reminder wizard) are approved and queued — see [Roadmap](#roadmap).

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

## Roadmap

The open plans in [`docs/plans/`](docs/plans/) form a dependency tree rooted at
the navigation shell. Recommended implementation order:

```
007 Navigation shell ──┬──> 008 Reminder-create flow
   (foundation)        ├──> 009 Library browser
                       └──> 006 Long-form guides (retarget onto shared kit)

005 Expand daily tips  ──> (independent; pure content — run in parallel)
006 Guide candidates   ──> (backlog; bulk authoring after 006 infra)
```

| # | Plan | Why here | Blocks |
|---|---|---|---|
| 1 | **007 — Navigation shell** | Foundation. Every later UI plan stacks on its anchor/session/prologue/back-home kit (ADR 009). Land it before any UI work. | 008, 009, 006 |
| 2 | **005 — Expand daily tips** | Pure content (~60 tips), **zero code**. Run in parallel with 007 — no conflict — so the tips branch is full before the library exposes it. | — |
| 3 | **006 — Long-form guides** | New `guide` content type + message splitter + `/guides` browse (ADR 008). After 007 so it's built on the shared kit; feeds 009's `📖 Статьи` branch. | 009 guides branch |
| 4 | **008 — Reminder-create flow** | Headline feature, wired. Back half (scheduler, dispatch, recurrence) already exists; this adds the create wizard on the 007 shell. | — |
| 5 | **009 — Library browser** | Unifying surface. Last of the features — it hosts the sibling branches from 005, 006, and the gated formulas, which should exist before the hub links to them. | — |
| 6 | **006 — Guide candidates** | Bulk guide-authoring backlog; only meaningful once 006 infra exists. Pull rows as desired. | — |

**Critical path:** 007 → 006 → 009, with 008 sliding in anywhere after 007 and
005 running alongside from the start. Fastest path to visible value:
**007 → 008** (reminders) with 005 in parallel, then 006 → 009.

> ⚠️ 009's combinations browser is **dark-shipped behind
> `FEATURE_COMBINATIONS_BROWSER`** (ADR 006 doctor-gate). It builds in step 5 but
> must not be enabled in production until the owner's documented medical sign-off.

## Setup

### Prerequisites

- Node.js 22+
- A Telegram account

### 1. Create the bot on Telegram

1. Open [@BotFather](https://t.me/BotFather) and send `/newbot`.
2. Give it a **display name** and a **username** ending in `bot`.
3. Copy the **HTTP API token** BotFather returns (`123456789:AAH...`).
4. Note the **username** you chose (without the leading `@`) — used for deep links.
5. *(Optional)* Send `/setcommands` and paste, so users get autocomplete:
   ```
   start - Запуск и главное меню
   browse - Травы и средства
   search - Поиск
   reminders - Мои напоминания
   subscriptions - Подписки и советы
   settings - Настройки
   donate - Поддержать проект
   help - Справка
   ```

### 2. Find your numeric Telegram id (for admin commands)

Message [@userinfobot](https://t.me/userinfobot); it replies with your numeric
id. Put it in `ADMIN_TELEGRAM_IDS`.

### 3. Configure environment

```bash
cd traditional-medicine-notifier-bot
npm install
cp .env.example .env
```

Edit `.env` and set at minimum:

```ini
BOT_TOKEN=123456789:AAH...          # from BotFather (step 1)
BOT_USERNAME=tm_notifier_bot        # your bot username, no leading @
TIMEZONE=Europe/Moscow              # IANA zone for all schedules
ADMIN_TELEGRAM_IDS=123456789        # your id from step 2 (optional)
```

Everything else has working defaults.

### 4. Run in development

```bash
npm run content:index   # build content/.index/ if not present
npm run dev             # tsx watch src/index.ts — hot reload
```

The bot uses **long polling** — no webhook, public URL, or TLS needed. Open your
bot in Telegram and send `/start`. The SQLite file is created automatically at
`DB_PATH` on first boot.

### 5. Verify the toolchain (optional)

```bash
npm run typecheck && npm run lint && npm test && npm run build
npm run content:index:check   # validates corpus + guards index drift
```

### Environment variables

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
