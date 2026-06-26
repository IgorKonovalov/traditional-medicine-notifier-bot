# Plan 008 — Reminder-create flow (the headline feature, wired)

**Status:** Approved — not started
**Created:** 2026-06-26
**Approved:** 2026-06-26
**Bump on close:** minor (new user-facing capability)
**Depends on:** Plan 007 (navigation shell) — uses its anchor/session/prologue kit.

## Context

Solicited reminders are the bot's **headline feature**, and the back half is
already built: `scheduled_reminders` (table), `notifications/scheduler.ts` +
`advanceReminder()` (tz-aware recurrence math), `services/reminder-dispatch.ts`
(cron tick that delivers due rows and advances `next_fire_at`), and the
`Notifier` seam (ADR 003/004). `/reminders` already **lists and cancels**. The
one missing piece is the **create flow**: there is no UI to go from "I want a
reminder" to a persisted `scheduled_reminders` row. The herb card's
`⏰ Напомнить` button and `/reminders`' "new" affordance both dead-end today.

This plan builds the multi-step **create wizard** on the navigation shell
(Plan 007): one anchor message edited per step, validated by the shared callback
prologue, state in `bot_sessions` keyed by internal `user_id`.

Reminders are **solicited** — they **bypass** the proactive daily cap (ADR 004);
no `notification-budget` involvement.

**Related:** completes the **ADR 004** solicited path; built on **ADR 009** /
**Plan 007**; honors **ADR 002** (no markup in any herb body the reminder links
to) and **ADR 003** (recurrence stays in pure `notifications/`, sessions on
internal id).

## Goals / Non-goals

- **Goals:**
  - A create-reminder wizard reachable from three entry points: the menu
    (`⏰ Напоминания` → `➕ Новое`), the `/reminders` list (`➕ Новое`), and a herb
    card's `⏰ Напомнить` (pre-links the herb).
  - Steps: **label** (free text, or auto from linked herb) → **recurrence kind**
    (once / daily / weekly / interval) → **time(s)** → **weekday(s)** (weekly
    only) → **confirm** → persist + compute first `next_fire_at`.
  - A clean mapping from UI choices to the existing `RecurrenceSpec` union; first
    fire computed via the existing scheduler helpers (no new recurrence math).
  - `/reminders` list shows newly created reminders with human-readable
    recurrence + next-fire, and cancel still works.
  - The herb-card `⏰ Напомнить` stub from Plan 007 becomes a real entry point.
- **Non-goals:**
  - **No edit-in-place of an existing reminder** (cancel + recreate for v1);
    editing is a follow-up.
  - No per-user timezone — reminders use the bot's configured tz (display it).
  - No new recurrence kinds beyond the existing union (`once`/`daily`/`weekly`/
    `interval`); no natural-language time parsing.
  - No snooze / quick-actions on delivered reminders (later).
  - No change to dispatch or budget semantics.

## Phases

### Phase 1 — Recurrence builder + session state
*Owner: dev.*
- **Deliverables:**
  - `src/bot/commands/reminders.create.ts` (or `reminder-create.ts`): a
    `ReminderDraft` session shape `{ label?, herbId?, kind?, times?, weekdays?,
    everyDays?, step }` stored under `SessionKind 'reminder-create'`.
  - A pure mapper `draftToRecurrence(draft): RecurrenceSpec` and
    `firstFireAt(spec, now, tz): number` that **delegates to**
    `notifications/scheduler.ts` (reuse `advanceReminder`/existing helpers; do not
    duplicate math). Lives bot-side but calls the pure module.
  - Validation: label non-empty/≤ limit; ≥1 time; weekly requires ≥1 weekday;
    interval `everyDays ≥ 1`.
  - Unit tests for `draftToRecurrence` × each kind and `firstFireAt` (incl. a
    time already passed today → rolls to next valid slot).
- **Acceptance:** mapper + first-fire unit tests green across all four kinds;
  invalid drafts rejected with typed errors; `npm test` green.

### Phase 2 — The wizard flow (anchor-edited steps)
*Owner: dev (with ux-telegram review of copy & button grids).*
- **Deliverables:**
  - Entry: menu `⏰ Напоминания` hub gains `➕ Новое`; `/reminders` gains `➕
    Новое`; herb card `⏰ Напомнить` opens the wizard with `herbId` + a default
    label pre-filled.
  - **Step — label:** if launched from a herb, offer "use herb name" or type a
    custom label; otherwise prompt for free text. Free-text capture uses a
    claimed `bot.on('text')` path **only while a create session is active** (so it
    never hijacks normal messages).
  - **Step — recurrence kind:** inline buttons `Один раз` / `Каждый день` /
    `По дням недели` / `Каждые N дней`, each editing the anchor.
  - **Step — time:** a grid of common times (e.g. 07/08/09/12/18/21) + the
    selected set shown; `once` also needs a date affordance (today/tomorrow + a
    small day-offset picker to keep it within callback limits).
  - **Step — weekdays (weekly only):** Mon–Sun toggle grid with `✓` state.
  - **Step — confirm:** human-readable summary ("Каждый день в 08:00 — «Пить
    тёплую воду»") + `Сохранить` / `Отмена`. On save: persist via the reminder
    repo, compute `next_fire_at`, dispose session, render success with a link back
    to the list.
  - Every step carries `« Назад` (to previous step) and respects the prologue;
    menu tap cancels the wizard (Plan 007 disposal).
  - All Russian strings in `messages.ts`; `callback_data` within 64 bytes (kind
    codes + indices, not labels).
- **Acceptance:** each kind can be created end-to-end; the persisted row's
  recurrence + `next_fire_at` match the summary; back steps don't lose prior
  choices; cancelling/menu-tap leaves no orphan session; free-text label capture
  doesn't fire outside an active session.

### Phase 3 — List integration & dispatch confirmation
*Owner: dev.*
- **Deliverables:**
  - `/reminders` (and the menu hub) list active reminders with a readable
    recurrence + next-fire line and a per-row `Отменить` (existing cancel path);
    a created reminder appears immediately.
  - Confirm an end-to-end delivery: a reminder due within the test window fires
    via the existing cron tick and dispatch, then advances/deactivates correctly
    (once → deactivates; recurring → next slot). No budget gate involved
    (ADR 004).
  - Architecture status: flip "Create-reminder multi-step session" from ⛔ to ✅.
- **Acceptance:** list reflects creates and cancels; a manual due-soon reminder
  delivers and advances; one-shot reminders deactivate after firing.

### Phase 4 — Validation, docs & close
*Owner: architect.*
- **Deliverables:**
  - Full gate run (typecheck, lint, test, build, content:index:check).
  - Refresh `docs/architecture/architecture.md` (create-reminder ✅; herb-card
    entry), `CLAUDE.md` if any convention is added; note the solicited path is now
    fully closed.
  - Semver **minor** bump; `CHANGELOG.md`; move plan to `done/`.
- **Acceptance:** all gates green; docs reflect the wired feature; plan in
  `done/`.

## Risks / Open questions

- **Free-text input within a session.** Telegram has no modal text input; the
  `on('text')` claim must be tightly scoped to an active create session and
  released on completion/cancel/expiry, or it will swallow unrelated messages.
  Primary bug risk — cover with tests and a clear claim/release in the session
  store.
- **Timezone correctness.** First-fire and recurrence must use the bot's
  configured tz consistently (the scheduler is already tz-aware); display the tz
  in the confirm step so users aren't surprised. Per-user tz is out of scope.
- **`once` needs a date, not just a time.** Keep the date picker minimal
  (today/tomorrow + small offset) to stay within the 64-byte callback budget and
  avoid a full calendar widget.
- **Label length / content.** Cap label length; it's user text echoed back in
  notifications — keep it plain (no markup, ADR 002) and trimmed.
- **Edit deferred.** v1 is create + cancel; if users expect edit, note it as the
  immediate follow-up rather than expanding scope here.

## Verification

- `npm run typecheck && npm run lint && npm test && npm run build` — green.
- Manual, per kind: menu `⏰ Напоминания` → `➕ Новое` → build a daily/weekly/
  interval/once reminder → confirm summary → it appears in the list → cancel one.
  From a herb card: `⏰ Напомнить` pre-links the herb and label.
- Delivery: create a reminder due within ~2 min → observe the cron tick deliver
  it → recurring advances, one-shot deactivates.
- Unit: `draftToRecurrence` × 4 kinds, `firstFireAt` (passed-time roll-over),
  prologue/stale-anchor on each step.

## Progress

- [ ] Phase 1 — Recurrence builder + session state
- [ ] Phase 2 — The wizard flow (anchor-edited steps)
- [ ] Phase 3 — List integration & dispatch confirmation
- [ ] Phase 4 — Validation, docs & close
