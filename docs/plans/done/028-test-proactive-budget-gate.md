# Plan 028 — Test the proactive notification-budget gate

**Status:** Completed
**Created:** 2026-07-01
**Completed:** 2026-07-01 (v0.27.3)
**Bump on close:** patch

## Context

The maintainability review (2026-07-01) flagged the single highest-value test
gap: **`services/notification-budget.ts` has no test file**, and neither does its
only caller **`services/subscription-dispatch.ts`**. This module is the
invariant-bearing gate for the entire **proactive** notification path — it
enforces "≤ 1 proactive push per user per calendar day" (ADR 004) and records
each send to `notification_log`. Every proactive surface routes through it
(`notification-budget.ts:60`). A regression here silently over- or under-notifies
real users, and nothing would catch it.

By contrast the **solicited** path (`recurrence`, `reminder-dispatch`,
`reminder-timezone`) and the **broadcast** path (`version-announcer`) are already
well covered. This plan closes the proactive-path hole to match.

Independent of plans 029–031; safe to do first.

## Goals / Non-goals

- **Goals:**
  - Direct unit tests for `notification-budget.ts` covering the daily-cap
    decision matrix and the `notification_log` recording side-effect.
  - Tests for `subscription-dispatch.ts` (`runDailyTipTick` / opt-in daily tip
    routing) driving the budget gate through its real caller.
  - Assert the typed `ProactiveOutcome` cases (delivered / skipped-already-pushed
    / transient / permanent) each occur under the right conditions.
- **Non-goals:**
  - No behavior change to the budget logic — tests describe current behavior.
  - No new proactive surfaces (per-category digests remain the documented
    skeleton).
  - The other review test gaps (`scheduler.advanceReminder`, `content/validate`,
    repos, middleware, payments) — out of scope; leave as backlog.

## Phases

### Phase 1 — notification-budget unit tests
- **Deliverables:** `src/services/notification-budget.test.ts` — use the
  existing in-memory DB test helper (`db/test-helper.ts`) and the same
  `Notifier` fake pattern the dispatch tests already use. Cover:
  - First push of the calendar day → delivered + row written to `notification_log`.
  - Second push same calendar day → `skipped-already-pushed`, no duplicate row,
    no notifier call.
  - Calendar-day boundary in the configured `timezone` (a push "yesterday" does
    not block "today") — reuse the timezone-aware fixture approach from
    `reminder-timezone.test.ts`.
  - Notifier transient vs. permanent failure → correct `ProactiveOutcome`, log
    row written only when appropriate.
- **Acceptance:** `pnpm test` green; the four outcomes are each asserted; failing
  the cap logic (e.g. removing the already-pushed check) makes a test go red.

### Phase 2 — subscription-dispatch tests
- **Deliverables:** `src/services/subscription-dispatch.test.ts` — drive
  `runDailyTipTick` end-to-end with a seeded set of opted-in/opted-out users and
  a fake notifier + clock; assert the gate is consulted per user and that
  opted-out users receive nothing.
- **Acceptance:** `pnpm test` green; a user already pushed today is skipped; an
  opted-out user is never delivered.

## Risks / Open questions

- **Time/clock injection [medium].** The budget uses "calendar day in
  `timezone`". Confirm the module takes an injectable clock/now (as
  `reminder-timezone` does) rather than reading wall-clock directly; if it reads
  wall-clock, the test may need a small seam. Flag if a (behavior-preserving)
  refactor is required rather than pure test addition — that would nudge the
  bump justification but stays patch.

## Verification

`pnpm test` — the two new files run green; temporarily breaking the cap check or
the day-boundary math turns them red (confirms they bind the invariant).

## Progress

- [x] Phase 1 — notification-budget unit tests (`4e6080d`)
- [x] Phase 2 — subscription-dispatch tests (`4e6080d`)

Both phases landed in one commit (`4e6080d`), pure test additions. No source
seam was needed — `sendProactivePush` already takes an injectable `now`/`timezone`
via `BudgetContext`, and `runDailyTipTick` takes an injectable `now`, so the
day-boundary and per-user gate cases are covered without touching production
code (the Risk-1 refactor was not required). Full gate green under pnpm
(typecheck + lint + 345 tests).
