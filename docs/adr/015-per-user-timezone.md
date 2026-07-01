# ADR 015 — Per-user timezone for reminders

**Date:** 2026-07-01
**Status:** Accepted

## Context

The bot shipped with a **single global timezone** (`config.timezone`, env
`TIMEZONE`), described in `config.ts` as an MVP simplification. Every scheduler,
the reminder-create wizard, and the calendar-day budget boundary read it. A
user's reminder times (`scheduled_reminders.recurrence`) are stored as local
`HH:MM` strings and resolved to an absolute `next_fire_at` (epoch-ms) in that one
zone.

Most current users are in **Serbia (CET/CEST)** but the global default was `UTC`,
so an "08:00" reminder fired at 09:00/10:00 their wall-clock. Users need to set
their own zone and have reminders fire at the intended local time.

**Can the zone be auto-detected?** No. The Telegram Bot API exposes no timezone —
only `language_code`, which is far too coarse (a `ru` speaker could be in any of
~9 zones). Location-share reverse-geocoding is heavyweight and invasive for a
reminder bot. So we default to a sensible zone and let the user change it.

The scheduling core was already timezone-parameterized: `computeNextFire`,
`advanceReminder`, and the wizard's `firstFireAt` all take a `timeZone` argument
(DST-correct via `Intl`). They were simply all fed `config.timezone`.

## Decision

Reminders resolve a **per-user IANA timezone**; the global `config.timezone`
becomes the **fallback default** (flipped `UTC` → `Europe/Belgrade`).

- **Storage:** a `timezone` key in the existing `user_settings` kv store
  (`SETTING_TIMEZONE`, `db/repositories/user.repo.ts`). No migration.
- **Resolver:** `getUserTimezone(userId, fallback)` (`user.repo.ts`) returns the
  stored zone or `fallback`, guarding a corrupt stored value so the dispatch loop
  can never throw on a bad row.
- **Threading:** the create wizard (`bot/commands/reminder-create.ts`) and the
  dispatch advance (`services/reminder-dispatch.ts`) resolve the reminder owner's
  zone instead of `config.timezone`. The per-minute tick cron itself stays
  bot-global (its zone is immaterial at minute granularity).
- **Recompute on change:** changing a zone re-derives `next_fire_at` for the
  user's active **recurring** reminders from their stored recurrence
  (`services/reminder-timezone.ts → recomputeUserReminderFireTimes`). `once`
  reminders carry no wall-clock time (only a baked instant), so
  `computeNextFire` returns `null` for them and they are left untouched — the
  "leave one-shots as-is" decision falls out for free.
- **UI:** a curated city list (`bot/timezones.ts`, index-addressable callbacks
  `set:tz:<i>` / `ob:tz:<i>`, `Europe/Belgrade` first). Set during onboarding
  (`bot/commands/start.ts`) and changeable in ⚙️ Настройки
  (`bot/commands/settings.ts`).

This **amends the "single timezone (MVP)" stance** in `config.ts` and the
scheduling assumption in ADR 004: reminder (solicited) timing is now per-user;
proactive timing is not (see below).

## Consequences

- Reminders fire at each user's intended local time, DST-correct (IANA names,
  never raw offsets).
- Every place that turns a reminder's wall-clock time into an instant must now
  resolve the **owner's** zone via `getUserTimezone`, not `config.timezone`.
  Adding a new reminder surface that skips this will silently use the global
  default.
- Changing a zone is not free: it rewrites `next_fire_at` for the user's active
  recurring reminders. This is bounded (a user's own rows) and synchronous.
- **Proactive timing stays bot-global.** The daily-tip cron and the
  notification-budget calendar-day boundary still use `config.timezone` directly.
  Per-user proactive delivery windows are deliberately out of scope — a future
  plan if needed.
- **Existing users** created reminders under the old `UTC` global. Their
  `next_fire_at` is not retro-recomputed; it re-derives into the new effective
  zone (CET) on the reminder's next advance, so at most one cycle drifts before
  self-healing. Acceptable on a private pre-launch bot.

## Alternatives considered

- **Raw UTC-offset picker** — rejected: no DST, so a CET user drifts one hour for
  half the year. IANA names via `Intl` handle transitions correctly.
- **Auto-detect from `language_code` / location** — rejected: `language_code` is
  too coarse to map to a zone; location-share is invasive and heavyweight.
- **`users.timezone` column** — workable, but the `user_settings` kv store
  already holds per-user preferences and needs no migration; chosen for
  consistency and lower cost.
- **Make proactive timing per-user too** — deferred: larger change (per-user cron
  fan-out or a scan-every-minute model) with no current demand.

## References

- Plan 025 — Per-user timezone for reminders.
- ADR 003 (portability: `user_id` PK, framework-free domain), ADR 004
  (notification paths), ADR 009 (navigation), Plan 008/024 (reminder flow).
