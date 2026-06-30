# Plan 024 — Reminders refresh (formula link, intake type, list detail, `.30` fix)

**Status:** Completed
**Created:** 2026-06-30
**Completed:** 2026-06-30
**Bump on close:** minor (v0.25.0)

## Context

The create-reminder wizard (Plan 008) and the reminders list (Plan 011) currently
support linking a reminder to a single **ingredient** (herb) only, and the list
deletes a reminder with a one-tap row button. Four changes, requested together:

1. **Formula link.** The wizard's link step must let the user attach a **formula
   (состав)** as an alternative to an ingredient. The «Составы» branch is live
   (`FORMULA_BRANCH_ENABLED = true`, ADR 006 sign-off) so formulas are a
   first-class, surfaceable content type.
2. **Intake type.** When a **formula** is linked, a new step asks how it is taken
   — plain **с тёплой водой** or prepared as an **отвар** (decoction) — echoed in
   the fired notification. (Owner decision: **formula-only**; ingredient and
   free-text reminders skip it.)
3. **`.30` minute bug.** In the time step, after selecting `:30` mode and tapping
   an hour, the committed time can come out as `HH:00` instead of `HH:30`
   ("Выбрано" line wrong). Root cause below.
4. **List → detail view.** Tapping a reminder in the list opens a **detail**
   screen (full info); deletion happens only there (owner decision: **immediate
   delete**, no confirm), not from the list rows.

Related: Plan 008 (wizard), Plan 011 (herb link + list), Plan 022 (`:00/:30`
minute mode), Plan 017/019 (Составы/Ингредиенты display split), ADR 003
(portability — `Notifier`, internal `user_id`), ADR 009 (navigation shell),
ADR 006 (formula gate, now lifted).

### Root cause of the `.30` bug

The hour buttons encode the minute mode **at render time** in their callback
data: `rc:time:${hh}${mode}` (e.g. `rc:time:0830`). The hour-tap handler commits
the minute straight from that callback string, **not** from the authoritative
server-side `draft.minuteMode`. Tapping `:30` flips `draft.minuteMode` and
re-renders the keyboard with new `…30` callbacks — but that re-render is an async
Telegram round-trip. A user who taps the hour **before the new keyboard lands**
(a fast tap, or any case where the edit is delayed/suppressed) sends the **stale**
`rc:time:HH00`, committing `HH:00`. The pure `timeView` render and the `rc:min`
handler are correct and test-covered — the defect is the callback-baked minute.

**Fix:** carry only the hour in the callback (`rc:time:HH`) and have the handler
combine it with `draft.minuteMode ?? '00'`. The mode toggle already persists the
mode independently and authoritatively, so the committed minute is always correct
regardless of keyboard-edit timing. (Display/checkmark logic is unchanged.)

## Goals / Non-goals

- **Goals:**
  - Link step offers a **type picker** — `🌿 Ингредиент` / `🧪 Состав` /
    `⏭ Пропустить` — then the matching browser.
  - Formula-linked reminders carry an **intake type** (`plain` | `decoction`),
    surfaced on the confirm screen, the list-detail screen, and the fired
    notification, with an `open-formula` notification CTA.
  - Reminders list rows open a **detail** screen; delete lives only there.
  - `.30` minute committed from server-side mode; race fixed; regression test.
- **Non-goals:**
  - No formula-card `⏰ Напомнить` pre-link entry (only the herb card pre-links;
    the wizard's in-flow formula picker covers formula reminders). Can be a later
    plan.
  - No editing of an existing reminder's schedule/link (detail screen is
    view + delete only).
  - No per-ingredient intake type (formula-only, per owner).
  - No change to recurrence kinds, the budget, or the dispatch tick cadence.
  - Chinese tradition stays gated (ADR 013) — formula picker shows the same
    visible corpus as the «Составы» branch.

## Phases

### Phase 1 — Data model: formula link + intake type

- **Deliverables:**
  - `src/db/schema.ts`: **migration 003** (additive) —
    `ALTER TABLE scheduled_reminders ADD COLUMN combination_id TEXT;` and
    `ADD COLUMN intake_type TEXT;`. Bump `LATEST_VERSION` to 3. No backfill
    (both nullable). Append `migration003` to `MIGRATIONS`.
  - `src/notifications/types.ts`: add `export type IntakeType = 'plain' |
    'decoction';`. On `ScheduledReminder` add `combinationId: string | null` and
    `intakeType: IntakeType | null`.
  - `src/db/repositories/reminder.repo.ts`: extend `ReminderRow`,
    `rowToReminder`, `NewReminder`, and `createReminder` INSERT to read/write
    `combination_id` + `intake_type`.
- **Acceptance:** `npm run typecheck` green; `reminder.repo.test.ts` extended to
  round-trip a formula-linked reminder with an intake type and a herb-linked one
  with nulls; `schema.test.ts` covers migration 003 column presence and that an
  existing v2 DB upgrades cleanly.

### Phase 2 — `.30` minute-mode fix

- **Deliverables:**
  - `src/bot/commands/reminder-create.ts`: hour buttons emit `rc:time:${hh}`
    (2-digit); the `rc:time` handler regex becomes `/^rc:time:(\d{2})$/` and
    builds the time as `${hh}:${draft.minuteMode ?? '00'}`. `timeView` checkmark
    logic unchanged (still keyed on `selected.has(\`${hh}:${mode}\`)`).
  - Update `reminder-create.test.ts` cases that assert `rc:time:0830`-style
    callbacks; add a regression test: with `minuteMode: '30'`, a tap on hour `08`
    commits `08:30` (and, simulating a stale keyboard, the committed minute still
    follows `draft.minuteMode`, not the callback).
- **Acceptance:** new regression test fails on the old code path, passes after;
  existing minute-mode tests updated and green.

### Phase 3 — Wizard: link type-picker + formula picker + intake step

- **Deliverables (`src/bot/commands/reminder-create.ts` + `messages.ts`):**
  - **Step graph.** Replace the `herb` step with a `link` step and add an
    `intake` step. `ReminderStep` becomes
    `'label' | 'link' | 'intake' | 'kind' | 'every' | 'time' | 'date' |
    'weekdays' | 'confirm'`. `stepsFor` head logic:
    - prelinked herb (herb-card path): `['label', 'kind']` (unchanged — no link,
      no intake).
    - otherwise: `['label', 'link', …]`, and `'intake'` is included **only when
      `draft.combinationId` is set**. So `nextStep`/`prevStep` (which recompute
      `stepsFor` from the live draft) route formula → `intake` → `kind`, and
      ingredient/skip → `kind`.
  - **Link sub-state.** Add `draft.linkView: 'choose' | 'herbs' | 'formulas'`
    (default `'choose'`) and `draft.formulaPage?: number`. The `link` step
    renders:
    - `choose`: buttons `rc:link:herbs` (`🌿 Ингредиент`), `rc:link:formulas`
      (`🧪 Состав`), `rc:link:skip` (`⏭ Пропустить`), then `navRow`. Back here
      goes to `label` (prev step).
    - `herbs`: the existing paginated herb picker, callbacks `rc:herb:<id>` /
      `rc:hpg:<n>`; a back button returns to `choose` (sets `linkView='choose'`),
      not the prev step.
    - `formulas`: a paginated formula picker over
      `deps.content.combinations.all`, callbacks `rc:formula:<id>` /
      `rc:fpg:<n>`; back returns to `choose`.
  - **Handlers.** `rc:link:herbs|formulas` set `linkView` and re-render;
    `rc:link:skip` clears `herbId`+`combinationId`, advances to `kind`.
    `rc:herb:<id>` sets `herbId`, clears `combinationId`, advances (→ `kind`).
    `rc:formula:<id>` sets `combinationId`, clears `herbId`, advances (→
    `intake`). `rc:fpg:<n>` pages. `rc:intake:(plain|decoction)` sets
    `intakeType`, advances to `kind`. Going back from `link` to `label`, or
    from `kind` to `intake`/`link`, must keep the draft's link fields coherent
    (re-entering `choose` resets `linkView` but preserves the chosen id so the
    confirm/intake stay valid; picking a different type clears the other id).
  - **Reuse** `herbPageSlice` (already generic) for the formula picker; guard
    every `rc:formula:<id>` / `rc:fpg` payload with `assertCallbackData`
    (formula ids ≈ `tib-formula-agar-8` → well under 64 bytes).
  - **Confirm + messages.** `view`'s `confirm` branch resolves a linked formula
    name (`deps.content.combinations.byId`) and renders a formula line +
    intake-type line. New `messages.reminderCreate` strings:
    `linkPrompt`, `linkHerb`, `linkFormula` (reuse `herbSkip`),
    `formulaLine(name)`, `intakePrompt`, `intakePlain` (`💧 С тёплой водой`),
    `intakeDecoction` (`🍵 Отвар`), `intakeLine(label)` (confirm/detail line),
    and a label for the linked formula. Keep `herbPrompt`/`herbLine`.
  - **Save.** `rc:save` persists `combinationId` and `intakeType` via
    `createReminder` (Phase 1).
- **Acceptance:** unit tests for `stepsFor` (formula path includes `intake`;
  ingredient/skip path does not; prelinked unchanged), the formula picker view,
  the new handlers (formula select → `intake` step; intake select → `kind`), and
  the confirm render with a formula + intake line. `npm run typecheck`/`lint`
  green.

### Phase 4 — Fired notification: formula CTA + intake echo

- **Deliverables:**
  - `src/services/notifier.ts`: extend `NotificationCta` to a union —
    `{ kind: 'open-herb'; herbId: string }` | `{ kind: 'open-formula';
    combinationId: string }`.
  - `src/bot/notifier.ts` `buildCta`: branch on `cta.kind`, rendering
    `herb:<id>` or `formula:<id>` callback data (button label reuses
    `messages.notify.openCta`).
  - `src/bot/commands/library.ts`: add `openFormulaCardAnchor(ctx, deps,
    formulaId)` mirroring `openHerbCardAnchor` (opens a fresh `formula-card`
    library session). `src/bot/commands/herb.ts` (or a small sibling): register a
    global `formula:<id>` action that calls it — mirroring the `herb:<id>` CTA
    entry. Gate-safe: only meaningful while `FORMULA_BRANCH_ENABLED`, but the CTA
    is only ever attached to formula-linked reminders, which only exist once the
    branch is live.
  - `src/index.ts` `buildMessage`: when `reminder.combinationId` is set, attach
    `{ kind: 'open-formula', combinationId }` and include the intake type in the
    body; when `herbId` is set, unchanged `open-herb`. New
    `messages.reminder.body` variant (or an intake suffix) that appends the
    intake line for formula reminders.
- **Acceptance:** tests for `buildCta` (both kinds → correct callback data) and
  `buildMessage` (formula reminder → `open-formula` CTA + intake in body; herb
  reminder → `open-herb`, unchanged; free-text → no CTA). A tap on the fired
  formula CTA opens the formula card (manual verification).

### Phase 5 — Reminders list → detail screen

- **Deliverables (`src/bot/commands/reminders.ts` + `messages.ts`):**
  - List rows become **open** buttons: `rem:open:<id>` (label = trimmed
    reminder label, no ❌). Keep the `➕ Новое` row. Remove the per-row
    `rem:cancel` delete from the list.
  - `rem:open:<id>` edits the message in place into a **detail view**: title +
    label, `describeReminder` schedule, next-fire line, linked
    ingredient/formula name + intake-type line (resolved from `deps.content`),
    and buttons `🗑 Удалить` (`rem:del:<id>`) + `« Назад` (`rem:list`).
  - `rem:del:<id>`: immediate `deactivateReminder`, toast
    `messages.reminders.cancelled`, re-render the list. `rem:list`: re-render the
    list. (Sessionless, like today — the id rides in the callback data; no
    `AnchoredSession` needed.)
  - New `messages.reminders` strings: `detailTitle`, `openRow(label)` if needed,
    `deleteButton`, `backButton`, link/intake lines (or reuse the
    `reminderCreate` line builders). Keep `nextFire`, `cancelled`.
- **Acceptance:** tests for `listView` (rows are `rem:open:<id>`, no cancel),
  a `detailView` builder (renders schedule + link + intake; delete + back
  buttons), and the `rem:del` handler (deactivates, returns to list). Manual:
  list → tap → detail → delete → back to list.

### Phase 6 — Review, docs, version

- **Deliverables:** architect review (this skill): run `typecheck`, `lint`,
  `test`, `build`, `content:index:check`. Update the **notification model** and
  **navigation** notes if any invariant text drifts; no new ADR expected (no
  portability/disclaimer rule changes — additive columns + a CTA variant).
  Decide bump (**minor** — user-facing) and author the `versionAnnouncements`
  entry on close.
- **Acceptance:** all gates green; plan moved to `done/` with the close commit.

## Risks / Open questions

- **Link step sub-state machine.** The `link` step has three render modes and
  two-level back (`herbs`/`formulas` → `choose` → prev step). Risk of confusing
  back/prev wiring. Mitigation: a single `draft.linkView` field drives the
  render, and the `link`-step back button is handled explicitly (sub-list →
  `choose`; `choose` → `prevStep`). Cover with `stepsFor`/nav unit tests.
- **Callback-data format change (`rc:time:HHMM` → `rc:time:HH`).** Any in-flight
  wizard session straddling the deploy keeps an old keyboard with `…HHMM`
  callbacks; the new 2-digit regex won't match, so a stale tap silently no-ops
  (acceptable — the user re-taps; sessions are short-lived, `SESSION_TTL_MS`).
- **Migration ordering.** Migration 003 is additive and idempotent under the
  existing runner; existing rows get `NULL` link/intake. No data risk.
- **64-byte callback budget.** Formula ids are short; `assertCallbackData` guards
  every formula/intake/open payload.
- **Open question (deferred, not blocking):** should the formula card later get
  its own `⏰ Напомнить` pre-link entry? Out of scope here; note for a follow-up.

## Verification

- `npm run typecheck && npm run lint && npm test && npm run build` and
  `npm run content:index:check`.
- Manual (dev bot):
  1. New reminder → link step shows `🌿 Ингредиент / 🧪 Состав / ⏭ Пропустить`.
  2. Pick `🧪 Состав` → formula list → pick one → **intake** step → choose
     `🍵 Отвар` → finish; confirm screen shows the formula + «Отвар».
  3. Time step: tap `:30`, then immediately tap an hour → committed time is
     `HH:30` (Выбрано correct), including a fast double-tap.
  4. Reminders list → tap a row → detail screen shows schedule + formula +
     intake; `🗑 Удалить` removes it and returns to the list.
  5. Let a formula reminder fire → notification body names the intake type and
     the «Открыть» button opens the formula card.

## Progress

- [x] Phase 1 — Data model (migration 003, types, repo)
- [x] Phase 2 — `.30` minute fix
- [x] Phase 3 — Wizard link picker + intake step
- [x] Phase 4 — Notification formula CTA + intake echo
- [x] Phase 5 — List → detail screen
- [x] Phase 6 — Review + docs + version bump
