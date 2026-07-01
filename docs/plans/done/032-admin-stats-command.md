# Plan 032 — Admin `/stats` command

**Status:** Completed — 2026-07-01 (v0.27.7)
**Created:** 2026-07-01
**Completed:** 2026-07-01
**Bump on close:** patch

## Context

The operator has no in-bot way to read health/usage numbers; today that means
querying SQLite by hand on the host. The sibling `serbian-language-bot` already
ships an admin-only `/stats` command, and this repo has been waiting on the same
feature — `docs/plans/README.md` lists "Admin `/stats` command (the
`adminTelegramIds` allowlist is already wired)" and
`docs/architecture/architecture.md` marks `/stats` as not-yet-built with
"allowlist plumbing present".

The admin allowlist is fully wired end-to-end and needs **no** config work:
`ADMIN_TELEGRAM_IDS` (`.env.example`) → `parseAdminTelegramIds` →
`Config.adminTelegramIds: ReadonlySet<string>` (`src/config.ts`) →
`BotDeps.adminTelegramIds` (`src/bot/context.ts`, populated in `src/index.ts`) →
`isAdmin(ctx, adminTelegramIds)` (`src/bot/context.ts`). `feedback.ts` already
consumes the allowlist as the DM recipient set, so this precedent is proven.

What's missing is (a) the command module and (b) the global count/aggregate
queries it reports — none exist yet; every current count method is per-user
(`countSentBetween`, `totalStars`).

This adapts the Serbian design to **our** domain. We drop their per-**level**
breakdown (a language-learning concept we don't have) and add our two notifier
paths — **reminders** (solicited) and **proactive** pushes.

Related: ADR 003 (portability — each repo owns its table, no Telegraf in domain),
ADR 002 (plaintext replies), ADR 004 (proactive daily cap / `notification_log`).

## Goals / Non-goals

- **Goals:**
  - A `/stats` slash command, **admin-gated**, that replies with a plaintext
    operational readout: user counts, reminders, proactive notifications,
    donations, and the running version.
  - Non-admins (and channel posts / missing `ctx.from`) get **no reply at all** —
    the command's existence is not leaked, matching the "admin handlers silently
    no-op" contract.
  - New global aggregate repo functions, each living in the repo that owns its
    table (ADR 003).
- **Non-goals:**
  - No per-user drilldown, no PII dump, no CSV/export.
  - Not advertised anywhere: **not** in `setBotCommands()` (the Telegram `/`
    menu), **not** in `/help`, **not** in the reply keyboard or `menu-router`.
  - No new config/env var (allowlist already wired).
  - No localization: the readout is operator-only **inline English** (see
    "Strings" decision below) — deliberately kept out of `messages.ts`.

## Decisions

- **Strings: inline English in the handler, not `messages.ts`.** CLAUDE.md
  forbids hardcoded *Russian* user-facing strings in handlers; that rule targets
  the Russian user surface. `/stats` is read only by the operator, so its labels
  live as inline English literals in a `formatStats(...)` helper — same call the
  Serbian bot made. Keeping them out of `messages.ts` avoids polluting the
  Russian UI catalogue with strings no user ever sees. (Confirmed with owner.)
- **"Proactive" = `notification_log` rows with `kind IN ('daily-tip','digest')`.**
  `NotificationKind = 'reminder' | 'daily-tip' | 'digest'`
  (`src/notifications/types.ts`); `reminder` is the solicited path and is
  reported separately from the reminders table, so it's excluded from the
  proactive count.
- **Calendar-day boundaries use UTC.** "Sent today" / "active 7d/30d" windows are
  computed against a UTC day boundary so numbers are stable across deploy
  environments (the Serbian bot formats timestamps in UTC for the same reason).
  This is an operator metric, not the per-user tz-aware daily-cap logic.
- **Composition in the handler, aggregates in the repos.** The handler calls one
  aggregate function per repo and assembles the string; no cross-table SQL leaks
  across repo boundaries (ADR 003).

## Phases

### Phase 1 — Aggregate repo queries

- **Deliverables:** new exported functions, each following the existing
  `getDb().prepare(...).get() as { n: number }` one-liner style, with a `now`
  parameter defaulted to `Date.now()` for testability:
  - `src/db/repositories/user.repo.ts` → `getUserStats(now = Date.now()): UserStats`
    returning `{ total, active7d, active30d, activeFlag }`
    (`COUNT(*)`; `last_seen_at >= now - N*DAY_MS`; `active = 1`).
  - `src/db/repositories/reminder.repo.ts` → `getReminderStats(): ReminderStats`
    returning `{ activeReminders, usersWithReminders }`
    (`COUNT(*)` and `COUNT(DISTINCT user_id)` where `active = 1`).
  - `src/db/repositories/notification-log.repo.ts` →
    `getProactiveStats(now = Date.now()): ProactiveStats` returning
    `{ today, last7d }` counting rows where
    `kind IN ('daily-tip','digest')` within the UTC-day / 7-day windows.
  - `src/db/repositories/donations.repo.ts` →
    `getDonationTotals(): DonationTotals` returning
    `{ count, totalStars, mostRecentAt }`
    (`COUNT(*)`, `COALESCE(SUM(stars_amount),0)`, `MAX(created_at)`).
- **Acceptance:** unit tests per function against an in-memory DB (seed a handful
  of rows, assert each count); `pnpm test` green.

### Phase 2 — Command module + wiring

- **Deliverables:**
  - New `src/bot/commands/stats.ts`:
    - `runStatsEntry(ctx, deps)` — `if (!isAdmin(ctx, deps.adminTelegramIds)) return;`
      then gather the four aggregates + version and
      `await ctx.reply(formatStats(...))` (plaintext, no keyboard, ADR 002).
    - `formatStats(...)` — inline-English fixed-width block (header carries the
      version; UTC timestamp for donations' most-recent via a small helper;
      `—` for null/empty).
    - `registerStatsCommand(bot, deps)` → `bot.command('stats', ...)`.
  - `src/bot/index.ts` — import + call `registerStatsCommand(bot, options.deps)`
    alongside the other registrars (kept below the user-facing commands; **not**
    added to the menu router or `setBotCommands`).
  - Version accessor: reuse whatever the version-announcer already reads for the
    current `package.json` version (no new mechanism).
- **Acceptance:** `src/bot/commands/stats.test.ts` covers: admin id → reply
  containing seeded numbers; non-admin id → **no** `ctx.reply`; missing
  `ctx.from` → no reply; empty allowlist → no reply. `pnpm test` green.

### Phase 3 — Docs

- **Deliverables:**
  - `docs/architecture/architecture.md` — flip `/stats` from "not-yet-built" to
    present in the command/implementation-status table.
  - `docs/plans/README.md` — remove `/stats` from the planned-items list.
  - Confirm `.env.example` `ADMIN_TELEGRAM_IDS` comment still reads correctly
    (no change expected).
- **Acceptance:** docs match shipped behavior; no ADR needed (no new
  cross-cutting rule — reuses the existing allowlist seam).

## Risks / Open questions

- **Empty allowlist in production** → `/stats` silently no-ops for everyone. This
  is the intended safe default (documented in `config.ts`); the operator must set
  `ADMIN_TELEGRAM_IDS` to use it. Boot logging already reports the admin count.
- **`notification_log` growth** — counts are `COUNT(*)` over an append-only table;
  fine at current scale, and the windowed queries hit `sent_at`. No index work
  planned; revisit only if the log grows large.
- **Column-name drift** — the plan names `last_seen_at`, `active`, `sent_at`,
  `kind`, `created_at`, `stars_amount`, `user_id`; dev must verify against
  `src/db/schema.ts` before writing SQL (all confirmed present at plan time).

## Verification

1. `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — all green.
2. Set `ADMIN_TELEGRAM_IDS` to your own Telegram id, run the bot, send `/stats` →
   receive the readout; verify numbers against a manual SQLite query.
3. Send `/stats` from a non-admin account (or with the var unset) → **no reply**.
4. Confirm `/stats` does **not** appear in the Telegram command menu or `/help`.

## Progress

- [x] Phase 1 — Aggregate repo queries (fbe9d82)
- [x] Phase 2 — Command module + wiring (2e86b73)
- [x] Phase 3 — Docs (e767cd3)
