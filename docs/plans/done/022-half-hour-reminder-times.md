# Plan 022 — Half-hour reminder times (:00 / :30 picker)

**Status:** Completed
**Created:** 2026-06-29
**Approved:** 2026-06-29
**Completed:** 2026-06-30
**Bump on close:** minor (new user-facing capability — half-past reminder times)
**Depends on:** Plan 008 (reminder-create flow) — extends its `time` step only.

## Context

The reminder-create wizard (`src/bot/commands/reminder-create.ts`, callback
scope `rc`) currently offers time selection as a fixed grid of **six curated
full-hour slots** — `TIME_SLOTS = ['07:00','08:00','09:00','12:00','18:00','21:00']`
(`reminder-create.ts:212`). The user wants to schedule reminders at **half-past**
(e.g. `14:30`), not only on the hour.

**The entire stack below the picker is already minute-aware** — this is a
UI-only change, no migration, no recurrence-math change:

- Times are stored as `HH:MM` strings inside the `recurrence` JSON blob
  (`RecurrenceSpec.times`), never as bare hours; `scheduled_reminders` has **no
  hour/minute columns** (`src/db/schema.ts`). No migration.
- Validation (`TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/`, `reminder-create.ts:95`;
  `isValidTime` in `recurrence.ts`) already accepts minutes `00–59`.
- `computeNextFire` → `zonedWallTimeToEpoch` (`src/notifications/recurrence.ts`)
  parses **both** hour and minute — `14:30` already computes a correct, DST-safe
  `next_fire_at`.
- The callback codec already round-trips a 4-digit `HHMM`
  (`timeCode`/`timeFromCode`, `:238–239`) and the tap handler regex is
  `rc:time:(\d{4})` (`:585`) — `1430` is already a legal payload.
- Display already renders minutes: `formatDateTime` uses `minute: '2-digit'`
  (`src/utils/datetime.ts`), and `describe*` templates interpolate the raw
  `HH:MM` verbatim.

So the **only** code that hardwires full hours is `TIME_SLOTS` and the `time`
view that renders from it. This plan reworks just that surface.

**No ADR.** The change stays entirely within the existing minute-aware design
(ADR 003 recurrence/storage unchanged; ADR 009 anchor/session kit unchanged).
No schema migration.

## Decisions (locked with owner, 2026-06-29)

- **Picker UX:** an **hour grid + a `:00` / `:30` minute-mode toggle**, replacing
  the fixed full-hour slot grid. Multi-select is preserved.
- **Granularity:** **`:00` and `:30` only** (no `:15` / `:45`).

## Goals / Non-goals

- **Goals:**
  - The `time` step shows a minute-mode toggle row `[:00 ✓] [:30]` above an hour
    grid. The active mode sets the minute applied to an hour tap.
  - Tapping hour `H` toggles `H:<mode>` in the selected set (recurring kinds,
    multi-select) or sets it and advances (`once`). A `✓` marks hours selected at
    the **current** mode; a `Выбрано: 08:00, 14:30` line lists the full concrete
    set across both modes so nothing is hidden.
  - Reuse the existing `rc:time:(\d{4})` handler unchanged — hour buttons emit
    `rc:time:${HH}${mode}` (e.g. `rc:time:1430`).
  - Works identically for `daily` / `weekly` / `interval` (multi-select + Далее)
    and `once` (single tap advances).
- **Non-goals:**
  - No `:15` / `:45` or arbitrary-minute granularity; no free-text time entry.
  - No DB migration, no change to `RecurrenceSpec`, recurrence math, dispatch, or
    the budget/cap semantics.
  - No per-user timezone (unchanged — bot tz, displayed on confirm).
  - No change to any step other than `time`.

## Phases

### Phase 1 — Minute-mode picker + tests
*Owner: dev (with ux-telegram review of the toggle copy & grid layout).*

- **Deliverables:**
  - **Draft state:** add `minuteMode: '00' | '30'` to `ReminderDraft`
    (`reminder-create.ts`), defaulting to `'00'` in `emptyDraft()` and read with a
    `?? '00'` fallback so any in-flight session created before this change keeps
    working.
  - **Constants:** replace `TIME_SLOTS` with an `HOURS` range constant for the
    grid. **Default `06–23`** (covers realistic reminder times; the old grid was
    only 6 hours, so this is already a large gain), **4 buttons per row**. Both the
    range and the column count are single tunable constants — extending to a full
    `00–23` grid is a one-line change (see Risks).
  - **`time` view rework** (`view()` `case 'time'`):
    - A minute-mode toggle row: two buttons emitting `rc:min:00` / `rc:min:30`,
      the active one prefixed `✓`.
    - The hour grid: each hour `HH` button labelled `HH`, prefixed `✓` when
      `${HH}:${minuteMode}` ∈ `draft.times`, callback
      `assertCallbackData(`rc:time:${HH}${minuteMode}`)`.
    - The `Далее` (recurring) + nav rows, unchanged.
    - Append a `Выбрано: <times>` line to the step text when `draft.times` is
      non-empty (`normalizeTimes(draft.times).join(', ')`).
  - **New handler** `bot.action(/^rc:min:(00|30)$/)`: validate via the callback
    prologue, set `draft.minuteMode`, `editAndPersist` to re-render. It must
    **not** change `step` or `times` (mode flip only — even for `once`).
  - **Existing `rc:time:(\d{4})` handler:** unchanged.
  - **Messages** (`messages.ts → reminderCreate`): tweak `timePrompt` /
    `timePromptOnce` to mention the minute toggle (e.g. «Выберите час. Минуты —
    переключатель :00 / :30. Можно несколько — затем «Далее».»); add a
    `selectedTimes: (list: string) => `Выбрано: ${list}`` label and minute-toggle
    button labels. Russian only, no markup (ADR 002).
  - **Tests** (extend the reminder-create wizard suite):
    - The `time` view builder: minute-toggle row present with `✓` on the active
      mode; each hour button emits `rc:time:${HH}${mode}` for the current mode;
      `✓` reflects `${HH}:${mode}` membership; the `Выбрано` line lists sorted
      times.
    - The `rc:min` flip updates `draft.minuteMode` and re-renders **without**
      changing `step` or `times`.
    - Selecting an hour in `:30` mode yields a `HH:30` entry that flows through
      `draftToRecurrence` / `firstFireAt` to a correct minute-30 `next_fire_at`
      (one focused assertion; the deeper minute math is already covered in the
      recurrence suite).
    - No regression from dropping `TIME_SLOTS` (existing wizard tests green).
- **Acceptance:** a user can pick `HH:00` **or** `HH:30` for any offered hour;
  recurring kinds keep multi-select; the toggle flips the applied minute without
  losing selections; `once` advances on an hour tap; `npm test` green.

### Phase 2 — Validation, docs & close
*Owner: architect.*

- **Deliverables:**
  - Full gate run: `npm run typecheck && npm run lint && npm test && npm run build
    && npm run content:index:check`.
  - Refresh `docs/architecture/architecture.md` only if it documents the
    full-hour picker; `CLAUDE.md` needs no change (no new convention). Note in the
    plan that the time picker is now half-hour-granular.
  - Semver **minor** bump (`npm version minor --no-git-tag-version`);
    `CHANGELOG.md` entry; one `versionAnnouncements` entry keyed to the new
    `X.Y.Z` (plain Russian sentence, e.g. «Теперь напоминания можно ставить и на
    полчаса — например, в 14:30 ⏰»).
  - Move plan to `docs/plans/done/022-half-hour-reminder-times.md`, set
    `Status: Completed` + `Completed:` date.
  - Commit: `docs(plans): close plan 022 + vX.Y.Z`.
- **Acceptance:** all gates green; announcement queued; plan in `done/`.

## Risks / Open questions

- **Hour-grid range.** Default is `06–23`. A user wanting a `00:00`–`05:00`
  reminder can't reach it from the grid. Mitigation: the range is a single
  constant — flip to full `00–23` (8 rows of 3, or 6 of 4) if night-time
  reminders are wanted. Flagged rather than silently capping; revisit if asked.
- **Mode-dependent `✓` on hour buttons.** A given hour can be selected at `:00`,
  `:30`, or both; the grid only checkmarks the **current** mode, so switching the
  toggle changes which hours show `✓`. The `Выбрано:` line always shows the full
  concrete set, so no selection is ever hidden — this is the disambiguator. Verify
  the copy makes the relationship obvious in ux review.
- **Session compatibility.** Adding `minuteMode` to the draft: in-flight sessions
  from before the deploy lack the field — the `?? '00'` read-time default covers
  them; no session-store migration.
- **`once` + toggle.** The minute toggle must re-render only (no advance); only an
  hour tap commits and advances. Covered by the handler split and a test.

## Verification

- `npm run typecheck && npm run lint && npm test && npm run build` — green.
- Manual: `/reminders` → `➕ Новое` → `Каждый день` → flip to `:30`, tap `08`
  → `08:30` shows under `Выбрано`; flip to `:00`, tap `14` → set is `08:30, 14:00`
  → confirm summary reads «Каждый день в 08:30, 14:00» → saved; next-fire renders
  with minutes. Repeat for `weekly` / `interval` / `once`.
- Unit: time-view builder (toggle marker, per-mode payloads, `✓`, `Выбрано`
  line); `rc:min` flip leaves step/times intact; a `:30` selection produces a
  minute-30 `next_fire_at`.

## Progress

- [x] Phase 1 — Minute-mode picker + tests (`56af2e0`)
- [x] Phase 2 — Validation, docs & close (`v0.24.0`)
