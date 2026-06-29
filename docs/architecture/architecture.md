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
| `content/types.ts` · `loader.ts` · `validate.ts` · `index-builders.ts` · `cross-links.ts` · `visibility.ts` | ✅ | loads herbs/**combinations**/categories/tips/**guides**; builds `.index/` (incl. `guides.json`); computes boot-time herb↔formula `crossLinks` maps on `LoadedContent` (Plan 009). **Tibetan-only visibility gate** (ADR 013, `visibility.ts`): hidden-tradition records dropped at load before buckets/cross-links/validation; the index builder opts out via `loadContent(dir, { includeHiddenTraditions: true })` so the committed index keeps the full corpus |
| `content/guides/*` (long-form articles) | ✅ | **guide** pull content type (ADR 008, Plan 006): a markdown body split into ordered sections on `##` headings; optional `TipSource` citation; 6 Tibetan guides authored — flagship «Основы тибетской медицины», сезонное питание, распорядок дня, суточный ритм, and the Plan 016 Wave 1 theory pair «Шесть вкусов» + «Как возникает болезнь». Pulled, not pushed — exempt from the proactive budget |
| `content/combinations/*` (150 Tibetan formulas) | ✅ | compound-formula content type (ADR 005); optional `nature` + `category` facet (ADR 007, `rinchen-pills`); **verbose, non-sanitised staging corpus** behind the doctor-review gate (ADR 006, `docs/medical-review.md`). Source-fidelity restored from `research/raw-crawl-verbose-v2.json` (Plan 004); `npm run content:review` rebuilds the doctor review HTML |
| `notifications/types.ts` · `recurrence.ts` · `scheduler.ts` | ✅ | pure; recurrence is tz-aware, unit-tested |
| `services/notifier.ts` (interface) | ✅ | the seam |
| `services/notification-budget.ts` | ✅ | ≤1 proactive/user/day (ADR 004) |
| `services/reminder-dispatch.ts` · `subscription-dispatch.ts` | ✅ | cron ticks wired; per-feature copy minimal |
| `services/version-announcer.ts` · `utils/version.ts` | ✅ | boot-time "what's new" broadcast: multi-version queue (≤3, oldest-first, spaced), opt-in + `priority` bypass, Notifier-direct cap-exempt (ADR 010, plan 010); idempotent via `notified_version` |
| `services/db-backup.ts` | ✅ | dated snapshot + rotation |
| `bot/notifier.ts` | ✅ | Telegraf-backed Notifier impl |
| `bot/middleware/*` | ✅ | error-handler, logger, rate-limiter, ensure-user |
| Navigation kit (`keyboards.ts` menu/back/home/pager · `menu-router.ts` · `render/anchor.ts` · `render/html.ts` · `commands/_callback-prologue.ts` · `commands/_herb-card.ts` · `_formula-card.ts` · `_formula-gate.ts`) | ✅ | persistent reply-keyboard menu + anchor-edit drilldown + callback prologue (ADR 009, Plan 007); `callback_data` ≤64 B guarded; `_formula-gate` is the single doctor-gate predicate (Plan 009). **Rich-text HTML seam** (ADR 011, Plan 014): branded `Html` + auto-escaping `html` template + tag-aware truncation in `render/html.ts`/`render/markdown.ts`; HTML-aware anchor siblings (`sendAnchorHtml`/`editAnchorHtml`/`editAnchorAtHtml`); `parse_mode` confined to the seam, global ESLint ban otherwise |
| `bot/commands/start·help·settings·library·herb·tips·donate·changelog` | ✅ | start = stepped onboarding; **`library` = unified 📚 Библиотека hub** (herbs all/by category → card · integrated 🔎 search · 💡 day's tip · 📖 **guides** · 🧪 formulas) on the anchor-edit kit, supersedes the old `browse`/`search` (Plan 009); the 📖 Статьи branch lists guides → section pager (`/guides` opens it; Plan 006, folded into the hub); herb card carries `⏰ Напомнить` + "Входит в формулы" cross-links; settings = state-reflecting hub; `/help` shows version; `/changelog` = release history (plan 010) |
| `bot/commands/reminders` (list/cancel) · `reminder-create` (wizard) | ✅ | create flow wired — menu/list/herb-card entry, anchor-edit steps (Plan 008); optional paginated herb-link step from the ➕ Новое path (Plan 011) |
| `bot/commands/feedback` | 🟡 | inline-arg relay; admin routing TODO |
| Create-reminder multi-step session | ✅ | `reminder-create` wizard: label → (optional herb link, ➕ Новое path only) → kind → time(s) → date/weekdays → confirm; solicited path now fully closed (Plan 008/011) |
| Combinations (formula) library branch | ✅ | **live** (Plan 009; owner sign-off 2026-06-28, `_formula-gate.FORMULA_BRANCH_ENABLED = true`): list + search + formula card. **Rendered as rich Telegram HTML** (Plan 014 / ADR 011): bold name · italic original-names sub-line (`parseOriginalNames`, verbatim fallback) · nature·tradition tag line · bulleted composition (Latin in `<code>`) · member cross-links · indications/traditional_use/dosing as plain labelled sections · cautions · disclaimer in `<blockquote>` (the only blockquote, appended after truncation, never cut). The older `themes` line was dropped from the card; the herb-card reverse-link buttons are capped (a herb in ~94 formulas would otherwise build a keyboard Telegram rejects). Raw `source_text`/`body` stay unsurfaced; final verbose sign-off pending (ADR 006, `docs/medical-review.md`) |
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
- ADR 002 — content in markdown, no `parse_mode` (**amended by ADR 011**)
- ADR 003 — portability discipline (Notifier seam, framework-free domain)
- ADR 004 — notification architecture (solicited vs. proactive + daily cap)
- ADR 005 — combinations content type · ADR 006 — verbose corpus doctor-gate +
  render-time disclaimer · ADR 007 — generic categories
- ADR 008 — long-form guides (pull content type, paginated split delivery);
  operationalised by Plan 006. `render/markdown.splitForTelegram` is the
  sanctioned multi-message splitter for long sends (paragraph-packing, loses
  nothing); `clampToTelegram` stays for single-card surfaces
- ADR 009 — bot navigation model (persistent menu, anchor-edit sessions,
  callback prologue, gated surfaces); operationalised by Plan 007
- ADR 010 — post-deploy version broadcast bypasses the daily cap (third
  notification path); operationalised by Plan 010
- ADR 011 — rich-text Telegram-HTML rendering behind a branded `Html` seam
  (amends ADR 002); `parse_mode` permitted only in `render/html.ts` + the
  HTML-aware anchor helpers, every interpolation escaped, tag-aware truncation;
  operationalised by Plan 014 (formula card the first surface, Phase 1)
- ADR 013 — user-facing surface is **Tibetan-only**; Chinese (TCM) records are
  authored-but-gated at a single content-load chokepoint (`visibility.ts`), files
  and index kept; operationalised by Plan 015

Keep this file's status table in sync as layers move from 🟡/⛔ to ✅.
