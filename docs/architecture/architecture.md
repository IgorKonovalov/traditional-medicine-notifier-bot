# Architecture

A layered Telegram bot: a thin Telegraf adapter over a framework-free domain
core, persisted in SQLite. The headline subsystem is **notifications**, split
into a solicited path and a proactive path (ADR 004).

> **Status legend:** ✅ built · 🟡 stub (seam/types real, logic TODO) · ⛔ planned

## Layers

```
┌──────────────────────────── src/bot/ (Telegraf adapter) ────────────────────────────┐
│ index.ts (createBot)  middleware/  commands/  payments/  notifier.ts  render/        │
│ messages.ts (RU)  keyboards.ts  menu-router.ts  context.ts  state-manager.ts         │
│ session-store.ts  render/anchor.ts  commands/_callback-prologue.ts (nav kit, ADR 009)│
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
| `content/types.ts` · `loader.ts` · `validate.ts` · `index-builders.ts` | ✅ | loads herbs/**combinations**/categories/tips; builds `.index/` |
| `content/combinations/*` (150 Tibetan formulas) | ✅ | compound-formula content type (ADR 005); optional `nature` + `category` facet (ADR 007, `rinchen-pills`); **verbose, non-sanitised staging corpus** behind the doctor-review gate (ADR 006, `docs/medical-review.md`). Source-fidelity restored from `research/raw-crawl-verbose-v2.json` (Plan 004); `npm run content:review` rebuilds the doctor review HTML |
| `notifications/types.ts` · `recurrence.ts` · `scheduler.ts` | ✅ | pure; recurrence is tz-aware, unit-tested |
| `services/notifier.ts` (interface) | ✅ | the seam |
| `services/notification-budget.ts` | ✅ | ≤1 proactive/user/day (ADR 004) |
| `services/reminder-dispatch.ts` · `subscription-dispatch.ts` | ✅ | cron ticks wired; per-feature copy minimal |
| `services/db-backup.ts` | ✅ | dated snapshot + rotation |
| `bot/notifier.ts` | ✅ | Telegraf-backed Notifier impl |
| `bot/middleware/*` | ✅ | error-handler, logger, rate-limiter, ensure-user |
| Navigation kit (`keyboards.ts` menu/back/home/pager · `menu-router.ts` · `render/anchor.ts` · `commands/_callback-prologue.ts` · `commands/_herb-card.ts`) | ✅ | persistent reply-keyboard menu + anchor-edit drilldown + callback prologue (ADR 009, Plan 007); `callback_data` ≤64 B guarded |
| `bot/commands/start·help·settings·browse·search·herb·tips·donate` | ✅ | start = stepped onboarding; browse/search/herb = anchor-edit drilldown w/ back/home + pager; settings = state-reflecting hub; tips = day's tip (Plan 005 expands) |
| `bot/commands/reminders` (list/cancel) | ✅ | create-reminder flow 🟡 (Plan 008) |
| `bot/commands/subscriptions` | ✅ | category sub/unsub |
| `bot/commands/feedback` | 🟡 | inline-arg relay; admin routing TODO |
| Create-reminder multi-step session | ⛔ | data model + dispatch ready; UI flow (Plan 008) builds on the nav kit |
| Combinations (formula) library branch | ⛔ | held behind the ADR 006 doctor-gate — not built/registered until owner sign-off (Plan 009) |
| Per-category proactive digests | ⛔ | `subscriptions` table + `listSubscribers` ready |
| Admin commands (`/stats`) | ⛔ | allowlist plumbing present (`adminTelegramIds`) |

## Boot pipeline

`loadConfig → initLogger → initDb (migrations) → loadContent (fail-fast) →
createBot (commands + menu-router) → createTelegrafNotifier →
startReminderDispatch + startSubscriptionDispatch → runBackup (best-effort) →
setMyCommands → bot.launch`. SIGINT/SIGTERM stops the crons, rate-limiter, bot,
and DB in reverse.

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
- ADR 005 — combinations content type · ADR 006 — verbose corpus doctor-gate +
  render-time disclaimer · ADR 007 — generic categories
- ADR 009 — bot navigation model (persistent menu, anchor-edit sessions,
  callback prologue, gated surfaces); operationalised by Plan 007

Keep this file's status table in sync as layers move from 🟡/⛔ to ✅.
