# Plan 025 — Per-user timezone for reminders

**Status:** Completed
**Created:** 2026-07-01
**Completed:** 2026-07-01
**Bump on close:** minor (v0.26.0)

## Context

Today the bot has exactly **one global timezone** (`config.timezone`, env `TIMEZONE`,
default `UTC`) that drives every scheduler, the reminder-create wizard, and the
calendar-day budget. The settings hub shows it **read-only** and its own header
notes "per-user timezones are a later plan." Reminder fire times are stored as
absolute epoch-ms in `scheduled_reminders.next_fire_at`, computed from local
`HH:MM` recurrence strings interpreted in that single zone.

Most users are in **Serbia (CET/CEST)**, but a `UTC` global means an "08:00"
reminder fires at 09:00/10:00 their wall-clock. We want each user to set their own
timezone, persist it, and have their reminders fire at the intended local time.

The scheduling core is **already timezone-parameterized** — `computeNextFire`,
`advanceReminder`, and the wizard's `firstFireAt` all accept a `timeZone` argument
(DST-correct via `Intl`). They are simply all fed `config.timezone` today. So this
plan is mostly **threading a per-user zone into those call sites** plus the UI to
set it and a recompute pass when it changes.

**Can we auto-detect the user's zone?** No — the Telegram Bot API exposes no
timezone (only `language_code`, which is too coarse). We default everyone to CET
and let them change it. This is recorded in **ADR 015** (new, this plan), which
supersedes the "single timezone (MVP)" note in `config.ts` / ADR 004's scheduling
assumptions.

Related: ADR 003 (portability — no Telegraf in domain; `user_id` PK), ADR 004
(notification paths), ADR 009 (navigation), Plan 008 (reminder-create flow),
Plan 024 (reminders refresh).

## Goals / Non-goals

- **Goals:**
  - Persist a per-user IANA timezone in `user_settings` (new key, **no migration**).
  - Default new and existing users to **`Europe/Belgrade` (CET)**; change the
    config default from `UTC` to `Europe/Belgrade` so the fallback and proactive
    surfaces align with the audience.
  - Let users pick their zone from a **curated city list** during **onboarding**
    and in **⚙️ Настройки** (change any time).
  - Reminder create/advance uses the **owner's** timezone, not the global one.
  - On timezone change, **recompute `next_fire_at` for all active recurring
    reminders** so they fire at the correct local time immediately (`once`
    reminders keep their original instant — see below).
  - ADR 015 documenting the per-user-timezone decision + the auto-detect answer.

- **Non-goals:**
  - **Proactive daily-tip / digest timing stays on the global `config.timezone`.**
    The `dailyTipCron` (`0 9 * * *`) and the notification-budget calendar-day
    boundary remain bot-global; per-user delivery windows are a separate future
    plan. (Flagged in ADR 015.)
  - **Multi-time reminders.** A reminder still carries a single time (Plan 024);
    "add/remove time" in the request means *apply the tz offset to fire times*,
    not add more times per reminder.
  - **Recomputing `once` reminders.** They store no wall-clock time (only a baked
    instant), so they keep their original absolute moment on a zone change. This
    falls out for free: `computeNextFire` returns `null` for `once`, so a recompute
    pass skips them without special-casing.
  - Free-offset / full-tz-database picker, or location-share detection.

## Design decisions

1. **Storage — `user_settings` kv, no migration.** Add
   `SETTING_TIMEZONE = 'timezone'` to `user.repo.ts` well-known keys, stored via
   the existing `getSetting`/`setSetting`. Value is a validated IANA name.

2. **Effective-timezone resolver.** A single helper
   `getUserTimezone(userId: number, fallback: string): string` in
   `user.repo.ts` → `getSetting(userId, SETTING_TIMEZONE) ?? fallback`, where
   `fallback` is the caller's `config.timezone` / `deps.timezone` /
   `options.timezone`. The repo takes the fallback as an argument so it never
   imports config (ADR 003). A stored value is trusted (it was validated on write),
   but the resolver still guards with `assertValidTimezone`-style try/catch,
   falling back on a corrupt value rather than throwing in the dispatch loop.

3. **Curated zone list — index-based callback.** New module
   `src/bot/timezones.ts` exporting an ordered
   `TIMEZONES: readonly { id: string; label: string }[]` (IANA id + Russian label).
   Callbacks reference the **index** (`set:tz:<i>`, `ob:tz:<i>`) so payloads stay
   tiny and well under 64 bytes (`assertCallbackData`). Starter list (ux-telegram
   may refine ordering/entries):
   `Europe/Belgrade` (Белград · CET), `Europe/Moscow` (Москва),
   `Europe/Kyiv` (Киев), `Europe/London` (Лондон), `Asia/Yerevan` (Ереван),
   `Asia/Tbilisi` (Тбилиси), `Asia/Almaty` (Алматы), `Asia/Bangkok` (Бангкок),
   `UTC` (UTC). `Europe/Belgrade` is first / the default highlight.

4. **Recompute on change (recurring only).** New pure-ish service
   `src/services/reminder-timezone.ts` →
   `recomputeUserReminderFireTimes(userId, timeZone, now)`: iterate
   `listUserReminders(userId)`, and for each active reminder call
   `computeNextFire(recurrence, now, timeZone)`; when it returns a non-null epoch,
   `setNextFire(id, epoch)`. `once` reminders return `null` → untouched. Lives in
   `services/` (reads repos + pure `notifications/recurrence`), keeping the bot
   handler thin and Telegraf-free per ADR 003.

5. **Tick cron stays global; advance goes per-user.** The reminder tick runs every
   minute, so the cron's own `{ timezone }` is immaterial and stays
   `config.timezone`. Inside `runReminderTick`, the advance switches to the owner's
   zone: `advanceReminder(reminder, now, getUserTimezone(reminder.userId, options.timezone))`.

## Phases

### Phase 1 — Storage, resolver, config default
- **Deliverables:**
  - `user.repo.ts`: add `SETTING_TIMEZONE` constant and
    `getUserTimezone(userId, fallback)` resolver (with corrupt-value guard).
  - `config.ts`: change `TIMEZONE` default `'UTC'` → `'Europe/Belgrade'`;
    update the doc comment (no longer "MVP single timezone").
  - `.env.example`: document `TIMEZONE=Europe/Belgrade` as the deploy default.
  - `src/bot/timezones.ts`: the curated `TIMEZONES` list + a `labelFor(id)` helper.
- **Acceptance:** unit tests for `getUserTimezone` (setting present / absent /
  corrupt → fallback). `TIMEZONES` ids all pass `assertValidTimezone`. Typecheck +
  lint clean.

### Phase 2 — Per-user zone in create + dispatch
- **Deliverables:**
  - `reminder-create.ts`: replace `const tz = deps.timezone` with
    `getUserTimezone(userId, deps.timezone)` for all fire-time computation
    (`firstFireAt`, previews).
  - `services/reminder-dispatch.ts`: `runReminderTick` resolves the owner's zone
    per reminder for `advanceReminder`.
  - `services/reminder-timezone.ts`: `recomputeUserReminderFireTimes`.
- **Acceptance:** new reminders created under a user with a non-default zone fire
  at the correct local instant (unit test around `firstFireAt` wiring + a
  dispatch/advance test asserting the owner's zone is used). `recompute` test:
  a daily recurring reminder shifts its `next_fire_at`; a `once` reminder is left
  untouched.

### Phase 3 — Settings entry (change timezone)
- **Deliverables:**
  - `settings.ts`: turn the read-only timezone line into a **▸ change** button
    (`set:tz:open`) → renders the curated list (`set:tz:<i>`) → on pick, persist
    `SETTING_TIMEZONE`, call `recomputeUserReminderFireTimes`, re-render hub with a
    `✓` confirmation showing the new zone. Back returns to the hub.
  - `messages.ts`: change `settings.timezone(tz)` copy (now user-specific, not
    "read-only"), add picker title + per-zone confirmation strings. All Russian,
    plaintext (ADR 002), "вы" tone.
  - Show the **effective** zone (`getUserTimezone(userId, deps.timezone)`) in the
    hub, not `deps.timezone`.
- **Acceptance:** tapping change → list → select updates the stored setting, shifts
  the user's recurring reminders, and the hub reflects the new zone. Stale-anchor
  taps no-op via `requireSessionAndAnchor` (ADR 009). Callback payloads pass
  `assertCallbackData`.

### Phase 4 — Onboarding step + ADR + docs
- **Deliverables:**
  - `start.ts`: insert a **timezone step** into onboarding. New flow:
    intro/tip opt-in → **timezone picker (`ob:tz:<i>`)** → finish on the menu.
    The tip handler now advances to the tz step instead of finishing; the tz
    handler sets `SETTING_TIMEZONE` + `SETTING_ONBOARDED` and lands on the menu.
    Existing (already-onboarded) users are unaffected — they set their zone in
    Settings; their effective zone is the new CET default until they do.
  - `messages.ts`: onboarding timezone-step copy.
  - `docs/adr/015-per-user-timezone.md`: the decision, the "no auto-detect"
    rationale, the CET default, and the explicit non-goal that proactive/daily-tip
    timing stays global. Note it amends the "single timezone (MVP)" stance in
    `config.ts` and ADR 004's scheduling assumption.
  - `docs/architecture/architecture.md`: refresh the notification/reminder section
    to describe per-user timezone resolution.
- **Acceptance:** a fresh `/start` walks intro → tip → timezone → menu and persists
  the chosen zone; a repeat `/start` skips straight to the menu (idempotent via
  `SETTING_ONBOARDED`). ADR + architecture doc updated.

## Risks / Open questions

- **Existing users' in-flight reminders.** Their `next_fire_at` was computed under
  the old `UTC` global and won't retro-recompute (recompute only fires on an
  explicit user change). On the reminder's next advance it moves into the new
  effective zone (CET), so at most one cycle drifts before self-healing. Acceptable
  on a private pre-launch bot; called out here rather than adding a boot migration
  sweep. *(If undesirable, a one-shot boot recompute for users with no
  `SETTING_TIMEZONE` could be added — deferred unless requested.)*
- **DST.** Storing IANA names (not raw offsets) is deliberate — `Europe/Belgrade`
  correctly follows CET↔CEST. The offset-grid alternative was rejected for exactly
  this reason.
- **Curated list coverage.** A user outside the list has no exact match. Accepted
  for v1; a "Другой" free-entry escape can be added later if support asks.
- **`config.timezone` now doubles as the fallback default and the proactive/budget
  zone.** Changing it to `Europe/Belgrade` shifts daily-tip send time and the
  budget calendar-day boundary to CET — intended given the audience, but noted so
  it isn't a surprise.

## Verification

- `npm run typecheck && npm run lint && npm test && npm run build`.
- Manual (private bot):
  1. Fresh `/start` → confirm the new timezone step appears after tip opt-in;
     pick Москва; verify a new daily reminder for "08:00" fires at 08:00 Moscow.
  2. `⚙️ Настройки` → change zone to Белград → confirm the hub shows Белград and an
     existing daily reminder's next fire shifts by the offset delta.
  3. Create a `once` reminder, change zone → confirm it keeps its original instant.
  4. Repeat `/start` → lands straight on the menu, no re-prompt.

## Review Comments (2026-07-01)

Implementation complete, all gates green (typecheck / lint / 331 tests / build /
content index). Two items block a clean close:

1. **Bug — hub shows the wrong zone after a toggle** (`src/bot/commands/settings.ts:136`,
   `:150`). The `set:tip:toggle` and `set:ann:toggle` handlers re-render `hubView`
   with `deps.timezone` (bot-global fallback) instead of
   `getUserTimezone(v.userId, deps.timezone)`. A user with a custom zone sees the
   timezone line revert to the global default label until they reopen Settings.
   Contradicts the Phase 3 acceptance ("Show the effective zone in the hub, not
   `deps.timezone`"). Fix: use the effective zone in both handlers; consider a
   regression test asserting the label survives a toggle.
2. **Stale comment** (`src/bot/commands/settings.ts:9-11`): header still says the
   timezone is "shown read-only (per-user timezones are a later plan)" — now false.

**Resolved (2026-07-01):** both fixed. The `set:tip:toggle` / `set:ann:toggle`
handlers now re-render `hubView` with `getUserTimezone(v.userId, deps.timezone)`,
and a regression test (`keeps the user timezone label after a daily-tip toggle`)
asserts the label survives a toggle. The `settings.ts` header comment now
describes the user-specific timezone + `set:tz:*` picker. All gates re-run green
(typecheck / lint / 332 tests / build / content index).

## Progress

- [x] Phase 1 — Storage, resolver, config default (86531b2)
- [x] Phase 2 — Per-user zone in create + dispatch (f8b1b72)
- [x] Phase 3 — Settings entry (change timezone) (dd144a3)
- [x] Phase 4 — Onboarding step + ADR + docs (c037d4e)
