# Architecture

A layered Telegram bot: a thin Telegraf adapter over a framework-free domain
core, persisted in SQLite. The headline subsystem is **notifications**, split
into a solicited path and a proactive path (ADR 004).

> **Status legend:** ✅ built · 🟡 stub (seam/types real, logic TODO) · ⛔ planned

## Layers

```
┌──────────────────────────── src/bot/ (Telegraf adapter) ────────────────────────────┐
│ index.ts (createBot)  middleware/  commands/  payments/  notifier.ts  render/        │
│ messages.ts (RU)  keyboards.ts  context.ts  state-manager.ts  session-store.ts       │
└───────────────┬───────────────────────────────────────────────┬─────────────────────┘
                │ depends on (interfaces, pure fns)              │ Notifier interface
                ▼                                                ▼
┌─── src/content/ ───┐   ┌─── src/notifications/ (pure) ───┐   ┌─── src/services/ ───┐
│ types · loader     │   │ types · recurrence · scheduler  │   │ notifier (iface)    │
│ validate · index   │   └─────────────────────────────────┘   │ notification-budget │
└────────────────────┘                                         │ reminder-dispatch   │
                ┌─── src/db/ ───┐                               │ subscription-dispatch│
                │ connection    │                               │ db-backup           │
                │ schema        │◄──────────────────────────────┤ (repositories)      │
                │ repositories  │                               └─────────────────────┘
                └───────────────┘
```

Dependency direction is one-way: `bot → {content, notifications, services, db}`.
Nothing in the domain imports Telegraf or `src/bot/` (ADR 003, ESLint-enforced).

## Module map & status

| Module | Status | Notes |
|---|---|---|
| `config.ts` / `logger.ts` | ✅ | typed env, pino |
| `db/connection.ts` · `schema.ts` (migration 001) · `test-helper.ts` | ✅ | WAL, additive migrations, in-memory test DB |
| `db/repositories/*` | ✅ | user, reminder, subscription, notification-log, session, donations |
| `content/types.ts` · `loader.ts` · `validate.ts` · `index-builders.ts` | ✅ | loads herbs/categories/tips; builds `.index/` |
| `notifications/types.ts` · `recurrence.ts` · `scheduler.ts` | ✅ | pure; recurrence is tz-aware, unit-tested |
| `services/notifier.ts` (interface) | ✅ | the seam |
| `services/notification-budget.ts` | ✅ | ≤1 proactive/user/day (ADR 004) |
| `services/reminder-dispatch.ts` · `subscription-dispatch.ts` | ✅ | cron ticks wired; per-feature copy minimal |
| `services/db-backup.ts` | ✅ | dated snapshot + rotation |
| `bot/notifier.ts` | ✅ | Telegraf-backed Notifier impl |
| `bot/middleware/*` | ✅ | error-handler, logger, rate-limiter, ensure-user |
| `bot/commands/start·help·settings·browse·search·herb·donate` | ✅ | functional |
| `bot/commands/reminders` (list/cancel) | ✅ | create-reminder flow 🟡 |
| `bot/commands/subscriptions` | ✅ | category sub/unsub |
| `bot/commands/feedback` | 🟡 | inline-arg relay; admin routing TODO |
| Create-reminder multi-step session | ⛔ | data model + dispatch ready; UI flow planned |
| Per-category proactive digests | ⛔ | `subscriptions` table + `listSubscribers` ready |
| Admin commands (`/stats`) | ⛔ | allowlist plumbing present (`adminTelegramIds`) |

## Boot pipeline

`loadConfig → initLogger → initDb (migrations) → loadContent (fail-fast) →
createBot → createTelegrafNotifier → startReminderDispatch +
startSubscriptionDispatch → runBackup (best-effort) → setMyCommands →
bot.launch`. SIGINT/SIGTERM stops the crons, rate-limiter, bot, and DB in reverse.

## Data model (migration 001)

`users` (internal PK) · `auth_identities` (telegram→user) · `user_settings` (kv) ·
`scheduled_reminders` (solicited) · `subscriptions` (proactive topics) ·
`notification_log` (append-only; powers the daily cap) · `bot_sessions`
(persistence) · `donations` (Stars, unique charge id).

## Key decisions

- ADR 001 — tech stack
- ADR 002 — content in markdown, no `parse_mode`
- ADR 003 — portability discipline (Notifier seam, framework-free domain)
- ADR 004 — notification architecture (solicited vs. proactive + daily cap)

Keep this file's status table in sync as layers move from 🟡/⛔ to ✅.
