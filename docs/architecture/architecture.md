# Architecture

A layered Telegram bot: a thin Telegraf adapter over a framework-free domain
core, persisted in SQLite. The headline subsystem is **notifications**: a
solicited path and a proactive path (ADR 004), plus a boot-time version
broadcast that bypasses the daily cap (ADR 010).

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
| `db/connection.ts` · `schema.ts` (migrations 001–002) · `test-helper.ts` | ✅ | WAL, additive migrations, in-memory test DB; migration 002 adds `users.notified_version` (plan 010) |
| `db/repositories/*` | ✅ | user, reminder, notification-log, session, donations (the subscription repo was removed with its UI in Plan 011; the table is retained) |
| `content/types.ts` · `loader.ts` · `validate.ts` · `index-builders.ts` · `cross-links.ts` | ✅ | loads herbs/**combinations**/categories/tips; builds `.index/`; computes boot-time herb↔formula `crossLinks` maps on `LoadedContent` (Plan 009) |
| `content/combinations/*` (150 Tibetan formulas) | ✅ | compound-formula content type (ADR 005); optional `nature` + `category` facet (ADR 007, `rinchen-pills`); **verbose, non-sanitised staging corpus** behind the doctor-review gate (ADR 006, `docs/medical-review.md`). Source-fidelity restored from `research/raw-crawl-verbose-v2.json` (Plan 004); `npm run content:review` rebuilds the doctor review HTML |
| `notifications/types.ts` · `recurrence.ts` · `scheduler.ts` | ✅ | pure; recurrence is tz-aware, unit-tested |
| `services/notifier.ts` (interface) | ✅ | the seam |
| `services/notification-budget.ts` | ✅ | ≤1 proactive/user/day (ADR 004) |
| `services/reminder-dispatch.ts` · `subscription-dispatch.ts` | ✅ | cron ticks wired; per-feature copy minimal |
| `services/version-announcer.ts` · `utils/version.ts` | ✅ | boot-time "what's new" broadcast: multi-version queue (≤3, oldest-first, spaced), opt-in + `priority` bypass, Notifier-direct cap-exempt (ADR 010, plan 010); idempotent via `notified_version` |
| `services/db-backup.ts` | ✅ | dated snapshot + rotation |
| `bot/notifier.ts` | ✅ | Telegraf-backed Notifier impl |
| `bot/middleware/*` | ✅ | error-handler, logger, rate-limiter, ensure-user |
| Navigation kit (`keyboards.ts` menu/back/home/pager · `menu-router.ts` · `render/anchor.ts` · `commands/_callback-prologue.ts` · `commands/_herb-card.ts` · `_formula-card.ts` · `_formula-gate.ts`) | ✅ | persistent reply-keyboard menu + anchor-edit drilldown + callback prologue (ADR 009, Plan 007); `callback_data` ≤64 B guarded; `_formula-gate` is the single doctor-gate predicate (Plan 009) |
| `bot/commands/start·help·settings·library·herb·tips·donate·changelog` | ✅ | start = stepped onboarding; **`library` = unified 📚 Библиотека hub** (herbs by tradition/category → card · integrated 🔎 search · 💡 day's tip · withheld 🧪 formulas) on the anchor-edit kit, supersedes the old `browse`/`search` (Plan 009); herb card carries `⏰ Напомнить` + gated "Входит в формулы" cross-links; settings = state-reflecting hub; `/help` shows version; `/changelog` = release history (plan 010) |
| `bot/commands/reminders` (list/cancel) · `reminder-create` (wizard) | ✅ | create flow wired — menu/list/herb-card entry, anchor-edit steps (Plan 008); optional paginated herb-link step from the ➕ Новое path (Plan 011) |
| `bot/commands/feedback` | 🟡 | inline-arg relay; admin routing TODO |
| Create-reminder multi-step session | ✅ | `reminder-create` wizard: label → (optional herb link, ➕ Новое path only) → kind → time(s) → date/weekdays → confirm; solicited path now fully closed (Plan 008/011) |
| Combinations (formula) library branch | 🟡 | **built but withheld** (Plan 009): list + search + formula card (minimal field set: name/nature/composition/member cross-links/themes/cautions) all gated by `_formula-gate.FORMULA_BRANCH_ENABLED` (default `false`). Absent from hub/search/cross-links until owner sign-off flips the constant (ADR 006); tests assert the absence |
| Per-category proactive digests | ⛔ | `subscriptions` table retained (dead); its UI **and** repo access layer were removed in Plan 011 — a future digest must re-add the repo helpers |
| Admin commands (`/stats`) | ⛔ | allowlist plumbing present (`adminTelegramIds`) |

## Boot pipeline

`loadConfig → initLogger → initDb (migrations) → loadContent (fail-fast) →
createBot (commands + menu-router) → createTelegrafNotifier →
startReminderDispatch + startSubscriptionDispatch → runBackup (best-effort) →
validateAnnouncements (fail-fast) → announceNewVersion (boot broadcast) →
setMyCommands → bot.launch`. SIGINT/SIGTERM stops the crons, rate-limiter, bot,
and DB in reverse.

## Data model (migrations 001–002)

`users` (internal PK; `notified_version` watermark added in migration 002 for
the broadcast loop) · `auth_identities` (telegram→user) · `user_settings` (kv;
holds the `feature_announcements` opt-in) ·
`scheduled_reminders` (solicited) · `subscriptions` (proactive topics; UI
retired in Plan 011, table retained under the additive-only rule) ·
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
- ADR 010 — post-deploy version broadcast bypasses the daily cap (third
  notification path); operationalised by Plan 010

Keep this file's status table in sync as layers move from 🟡/⛔ to ✅.
