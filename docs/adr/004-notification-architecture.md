# ADR 004 — Notification architecture: solicited vs. proactive + daily cap

**Date:** 2026-06-23
**Status:** Accepted (amended by ADR 010 — adds a third, cap-exempt broadcast path)

## Context

The bot's headline feature is "extended notifications", which the product
defines as two things: **user-scheduled reminders** (the user asks to be pinged
at chosen times) and **topic subscriptions / daily tips** (the bot proactively
pushes content). These have opposite contracts — one is requested, one is
unsolicited — so a single delivery policy would be wrong for both.

## Decision

Split delivery into **two paths**, both behind the `Notifier` interface
(ADR 003):

1. **Solicited — `services/reminder-dispatch.ts`.** A frequent cron tick
   (`REMINDER_TICK_CRON`, default every minute) delivers every due
   `scheduled_reminders` row and advances `next_fire_at` via the pure
   `notifications/scheduler` + `recurrence`. These deliveries **bypass the daily
   cap** — the user explicitly asked for them — and call the Notifier directly.

2. **Proactive — `services/subscription-dispatch.ts`.** A daily cron
   (`DAILY_TIP_CRON`) pushes tips/digests to opted-in users. Every proactive
   send **must** route through `services/notification-budget.sendProactivePush`,
   which enforces **≤1 proactive push per user per calendar day** (tz-aware via
   `utils/datetime.formatDate`, state in the `last_proactive_push_date` user
   setting) and records to `notification_log`.

**Any new proactive surface must call `sendProactivePush`.** Sending proactively
via the Notifier directly bypasses the cap and is a bug. Solicited reminders are
the only sanctioned direct-send path.

> **Amended by ADR 010.** A **third** path was added: the post-deploy version
> broadcast (`services/version-announcer.ts`, plan 010). It is a one-shot-per-
> version event made idempotent by a per-user `notified_version` watermark, so
> it delivers **Notifier-direct and exempt from this cap** — like a solicited
> reminder. The rule above now reads: every *proactive* (recurring,
> bot-initiated) surface must call `sendProactivePush`; the sanctioned
> direct-send paths are solicited reminders **and** the version broadcast. See
> ADR 010 for the rationale (routing the broadcast through the cap would drop
> release notes and create a per-boot retry loop).

## Consequences

- Users keep full control of solicited reminders (create/cancel) with on-time delivery; the bot can't spam them with proactive content (one push/day max).
- A future proactive feature (re-engagement nudge, per-category digest) inherits the cap for free by routing through the gate.
- The cap is per **calendar day** in the bot timezone, not a rolling 24h window — matches the day boundary used elsewhere and is trivially correct.
- The budget is pure except for the injected `Notifier` and two DB reads/writes, so the cap and day-boundary are unit-testable in isolation.

## Alternatives considered

- **One delivery policy for everything** — either caps solicited reminders (breaks the feature the user asked for) or uncaps proactive pushes (spam risk).
- **A rolling 24-hour rate limit** — needs window arithmetic and gives worse UX across local midnight; the calendar-day cap reuses the existing date boundary.
- **Per-feature caps** — can't enforce "one proactive push total" across multiple future proactive surfaces; the shared gate can.

## References

- ADR 003 — portability discipline (schedulers depend on `Notifier`).
- ADR 002 — no `parse_mode` (proactive bodies are plain text + emoji).
