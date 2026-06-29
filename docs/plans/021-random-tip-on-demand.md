# Plan 021 — random tip on the on-demand surfaces

**Status:** Implemented — pending review
**Created:** 2026-06-29
**Bump on close:** minor

## Context

Tapping the `💡 Советы` menu button (and `/tips`, and the library leaf
`💡 Совет дня`) currently shows the *same* deterministic "tip of the day" that
the proactive daily push delivers. Selection is `pickDailyTip` in
`src/bot/commands/tips.ts` — `tips[dayIndex % tips.length]`, identical for every
user and constant for the whole day. So a user who already saw today's push, or
who taps the button twice, sees nothing new.

The owner wants the **on-demand** tip surfaces to serve a **random** tip instead,
so repeated taps feel fresh, while the **proactive once-a-day push keeps its
deterministic "Совет дня"** selection (it is, genuinely, the tip of the day and
is budget-gated to ≤1/day per ADR 004).

With 126 published tips in the corpus this is purely a selection + small
per-user state change — no content work, no notification-model change.

Related: Plan 005 (daily-tip rotation), Plan 018 (tip corpus to 126), ADR 004
(proactive budget — untouched here), ADR 009 (navigation kit).

## Goals / Non-goals

- **Goals:**
  - The three on-demand tip surfaces (`/tips`, `💡 Советы` menu button, library
    `lib:tips` leaf) serve a **uniformly random** tip per tap.
  - **Avoid recent repeats per user:** exclude the last *N* tips that user was
    shown on-demand so consecutive taps don't immediately repeat.
  - Keep the proactive daily push (`src/index.ts` → `subscription-dispatch`)
    deterministic and unchanged.
  - Fix the now-false "Совет **дня**" wording on the on-demand surfaces.
- **Non-goals:**
  - No "Ещё совет" / re-roll inline button (decided: each tap = one tip).
  - No change to the proactive push, the notification budget, or `notification_log`.
  - No persistence of tip history across restarts (in-memory is sufficient — see
    Risks); no DB migration.
  - No change to the tip content corpus, index, or loader.

## Design decisions

- **Selection helper (pure).** Add `pickRandomTip(tips, exclude): Tip | null`
  alongside `pickDailyTip` in `src/bot/commands/tips.ts`. Picks uniformly from
  the tips whose `id` is **not** in `exclude`; if every tip is excluded (corpus
  smaller than the history window), it falls back to a uniform pick over the full
  pool. `Math.random` is acceptable here — this is bot-layer UX, not a
  framework-leaking dependency (ADR 003 only forbids Telegraf outside `src/bot/`).
  `pickDailyTip` **stays** for the proactive path.
- **Per-user recent history (in-memory).** A small bot-layer module
  (`src/bot/commands/tip-history.ts`) holding `Map<number, string[]>` keyed by
  **internal `user_id`** (from `getUserId(ctx)`, ADR 003), with `getRecent(userId)`
  and `recordShown(userId, tipId)`. Ring buffer capped at
  `HISTORY_WINDOW = min(8, tips.length - 1)` so at least one tip is always
  selectable. Chosen over a DB column because the value is a soft UX nicety, not
  durable state — losing it on restart is harmless, and it keeps the change
  framework-free with no migration.
- **Wording split.** Keep `messages.tip.daily(...)` ("🌿 Совет дня") for the
  proactive push. Add `messages.tip.random(...)` ("🌿 Совет") for the on-demand
  surfaces, and relabel the library leaf `messages.library.tips`
  `💡 Совет дня` → `💡 Случайный совет`. The reply-keyboard button stays
  `💡 Советы` (already plural/neutral).

## Phases

### Phase 1 — selection helper + per-user history
- **Deliverables:**
  - `pickRandomTip(tips: readonly Tip[], exclude: ReadonlySet<string>): Tip | null`
    in `src/bot/commands/tips.ts`.
  - `src/bot/commands/tip-history.ts` — in-memory recent-tips ring buffer keyed by
    internal `user_id` (`getRecent`, `recordShown`, `HISTORY_WINDOW`).
  - Unit tests: `pickRandomTip` never returns an excluded id while a non-excluded
    one exists; returns `null` on empty pool; falls back when all excluded; the
    ring buffer evicts oldest past the window.
- **Acceptance:** `npm test` green; helper is pure (history passed in, not read
  inside the picker).

### Phase 2 — wire the on-demand surfaces + wording
- **Deliverables:**
  - `tipsEntry` (`src/bot/commands/tips.ts`): resolve `getUserId(ctx)`, pick via
    `pickRandomTip(all, getRecent(uid))`, `recordShown`, render with
    `messages.tip.random`. Fall back to a stateless pick (empty exclude) when
    `userId` is `undefined`.
  - `tipsView` (`src/bot/commands/library.ts`): thread the internal `user_id`
    into the view (signature gains the id / `ctx`), same pick→record→render path;
    `lib:tips` case updated accordingly.
  - `messages.ts`: add `tip.random(body, source?)` → "🌿 Совет"; relabel
    `library.tips` → `💡 Случайный совет`. Leave `tip.daily` untouched.
- **Acceptance:** repeated `/tips` / menu taps return varied tips and don't
  immediately repeat within the window; proactive push still renders
  "🌿 Совет дня"; `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
  all green.

## Risks / Open questions

- **History is per-process / non-persistent.** A restart clears recent history,
  so a repeat can occur right after a redeploy. Accepted — soft UX nicety, no
  durability needed. Documented so it isn't mistaken for a bug.
- **Single-process assumption.** The in-memory map is correct only for the
  current single-process deploy; if the bot is ever horizontally scaled, history
  becomes per-instance. Out of scope; flag if scaling is planned.
- **`getUserId` may be undefined** if ensure-user middleware hasn't run for a
  surface — handled by the stateless fallback (still random, just no exclusion).

## Verification

1. `npm run typecheck && npm run lint && npm test && npm run build`.
2. In the bot: tap `💡 Советы` ~10× — observe varied tips, no immediate repeat
   within the last 8. Run `/tips` and the library `💡 Случайный совет` leaf —
   same behavior, shared history.
3. Confirm the proactive daily push (boot/cron path) still shows "🌿 Совет дня"
   and is unchanged.

## Progress

- [x] Phase 1 — selection helper + per-user history (665edf1)
- [x] Phase 2 — wire on-demand surfaces + wording (665edf1)
