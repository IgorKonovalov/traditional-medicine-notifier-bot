# Plan 031 — Extract shared callback-registrar + cron-tick helpers

**Status:** Draft
**Created:** 2026-07-01
**Completed:** —
**Bump on close:** patch

## Context

The maintainability review (2026-07-01) found two repeated scaffolds that a small
shared helper would collapse without changing behavior:

1. **Callback-handler boilerplate repeated ~30× in `library.ts`.** Every
   drilldown action is the identical shape
   (`library.ts:976-1011` is representative):
   ```
   const v = await requireSessionAndAnchor<LibraryState>(ctx, 'library');
   if (v === null) return;
   await ctx.answerCbQuery();
   await go(ctx, v, { … });
   ```
   plus **nine** literally-identical no-op handlers
   (`bot.action(/^lib:…:noop$/, (ctx) => ctx.answerCbQuery())`). The
   `requireSessionAndAnchor` prologue (`_callback-prologue.ts`) is already a good
   shared primitive; the *registration* scaffold around it is still copy-pasted.

2. **Duplicated cron-start skeleton** across the two dispatch services:
   `startReminderDispatch` (`services/reminder-dispatch.ts:32-46`) and
   `startSubscriptionDispatch` (`services/subscription-dispatch.ts:36-50`) are the
   same `cron.validate → cron.schedule → .catch(log.error) → log.info` shape with
   different labels.

This plan factors both into tested helpers: an `onSession(...)` registrar and a
`startCronTick(...)` wrapper. It **enables plan 029** (the library split) — the
split siblings should consume `onSession` rather than re-copy the wrapper — so
**run this before 029.**

## Goals / Non-goals

- **Goals:**
  - A callback registrar, e.g. `onSession(bot, pattern, kind, (ctx, session) =>
    …)`, that runs the `requireSessionAndAnchor` prologue + `answerCbQuery` and
    invokes the body only on a live, anchored session (ADR 009 semantics
    preserved). Plus a one-liner for the no-op ack handlers.
  - A `startCronTick(name, cron, tz, tick)` helper encapsulating validate →
    schedule → `.catch(log.error)` → startup log; both dispatch services use it.
  - Net line reduction in `library.ts` (~120–150 lines) and both dispatch
    services, with the callback/cron semantics byte-for-byte unchanged.
- **Non-goals:**
  - No change to callback-data scopes/ids, session TTL, or dispatch timing.
  - Not the file split itself (that's plan 029) — this only introduces the
    helpers and adopts them in place.

## Phases

### Phase 1 — cron-tick helper
- **Deliverables:** `src/services/cron-tick.ts` (framework-free, depends only on
  `node-cron` + logger) exporting `startCronTick`; `reminder-dispatch.ts` and
  `subscription-dispatch.ts` adopt it. Add `cron-tick.test.ts` (invalid cron
  throws at startup; a throwing tick is caught and logged, never kills the
  schedule).
- **Acceptance:** `pnpm test` green; both dispatchers behave identically;
  existing `reminder-dispatch.test.ts` unchanged and passing.

### Phase 2 — callback `onSession` registrar
- **Deliverables:** a registrar helper alongside `_callback-prologue.ts`;
  `library.ts` action registrations rewired through it, including the nine no-op
  handlers via a single ack helper. Extend `_callback-prologue.test.ts` (or add
  a registrar test) covering: live session → body runs; stale/absent session →
  silent ack + no-op; wrong-anchor tap → no-op.
- **Acceptance:** `pnpm run typecheck && pnpm run lint && pnpm test` green;
  `library.test.ts` passes unchanged; `library.ts` line count drops materially;
  stale-tap behavior (ADR 009) verified by test.

## Risks / Open questions

- **Generic typing of the registrar [medium].** `requireSessionAndAnchor<S>` is
  generic over the state type; the `onSession` wrapper must thread `S` through
  without resorting to `any` (the codebase is currently `any`-free — keep it so).
- **Ordering vs. plan 029 [low].** Land this before 029 so the library split
  consumes the registrar. If 029 already ran, Phase 2 still applies but touches
  the new siblings instead.

## Verification

Full gate green under pnpm; the two dispatch services and every rewired library
action behave identically (existing tests + the new helper tests). `git diff`
shows the scaffold replaced by helper calls, no logic deltas.

## Progress

- [x] Phase 1 — cron-tick helper (`src/services/cron-tick.ts` +
      `cron-tick.test.ts`; `reminder-dispatch.ts` / `subscription-dispatch.ts`
      adopt `startCronTick`). Exact log strings preserved via `dispatchLabel`
      (`<label> dispatch started`) + `tickLabel` (`<label> tick failed`) — the
      two services' labels are asymmetric (tick: `reminder`/`daily-tip`). The
      swallow-and-log wrapper is exported as `guardTick` with an injectable
      logger so it is unit-tested without a live cron.
- [x] Phase 2 — callback `onSession` registrar
      (`src/bot/commands/_session-registrar.ts` + `_session-registrar.test.ts`).
      All ~30 `library.ts` action registrations rewired through `onSession<S>`
      (generic over state, no `any`; `CallbackActionCtx` keeps `ctx.match`
      typed), and the 9 no-op ack handlers through `onAck`. `library.ts`
      1326→1240 lines; ADR 009 stale/absent/wrong-anchor semantics preserved
      (the prologue is unchanged; registrar tests cover live/absent/stale).
