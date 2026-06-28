# ADR 010 — Post-deploy version broadcast bypasses the daily cap

**Date:** 2026-06-28
**Status:** Accepted

## Context

Plan 010 adds a **post-deploy "what's new" broadcast**: on boot, the bot sends
each active user the Russian announcement strings for every minor/major release
they haven't seen yet (idempotent via a per-user `notified_version` column).

ADR 004 split delivery into two paths and laid down a blanket rule: *"Any new
proactive surface must call `sendProactivePush`"* — the ≤1-proactive-push-per-
user-per-calendar-day gate. Taken literally, the version broadcast is a new
proactive surface and would have to route through that gate. That is the wrong
contract for it:

- A version announcement is a **one-shot-per-version** event, not a recurring
  stream. Its anti-spam guarantee comes from `notified_version` (a user sees a
  given release's note at most once, ever), not from a daily counter.
- Routing it through the daily cap would make the two surfaces **interfere**: a
  user who already received today's daily tip would have their release note
  silently dropped (and vice-versa), then — because `markNotified` runs only on
  a successful send — the announcer would retry the same release every boot
  until a day with no tip happened to come along. Coupling an idempotent,
  version-keyed event to a per-day budget is both incorrect and a latent
  retry-loop bug.

So ADR 004's blanket rule is too broad. This ADR narrows it.

## Decision

The post-deploy version broadcast is a **third notification path**, alongside
solicited and proactive:

3. **Broadcast — `services/version-announcer.ts`.** Runs once at boot (after DB
   init + migrations + content load, before `bot.launch()`). Walks active users
   whose `notified_version` is stale and delivers the per-version announcement
   queue **Notifier-direct, bypassing `sendProactivePush`** — exactly like a
   solicited reminder. Idempotency, crash-recovery, and "show each release at
   most once" are guaranteed by the per-user `notified_version` watermark, not
   by the daily budget. The opt-in (`feature_announcements`, default off) and
   `priority` bypass govern *who* receives a non-priority note; neither touches
   the daily cap.

ADR 004's rule is amended to: *every **proactive** surface (recurring,
bot-initiated content) must call `sendProactivePush`; the sanctioned
direct-send paths are solicited reminders **and** the post-deploy version
broadcast.* ADR 004 carries a pointer to this ADR; it is not otherwise
rewritten.

**ADR 003 (portability) is unaffected and stays valid.** The announcer lives in
`src/services/`, depends only on the `Notifier` interface and the user
repository, and imports no Telegraf. `AnnouncementMessage` is an additive
domain type in `services/notifier.ts` (body + optional `NotificationCta` +
optional `priority`), so the framework-free-domain rule still holds.

## Consequences

- A reader who finds a Notifier-direct send outside `reminder-dispatch` no
  longer has to assume it's a cap-bypass bug — there are now two sanctioned
  direct paths, both named here and in ADR 004.
- The broadcast can't be "fixed" by routing it through the gate without
  reintroducing the interference + retry-loop described above; this ADR records
  why, so the carve-out survives future refactors.
- Future genuinely-proactive surfaces (re-engagement nudges, per-category
  digests) still inherit the daily cap for free — the narrowing is specific to
  the version broadcast, not a general loosening.
- The broadcast does **not** write to `notification_log` (that log powers the
  daily cap, which the broadcast ignores); its audit trail is the
  `notified_version` watermark plus the structured `version-announcer: …` logs.

## Alternatives considered

- **Route the broadcast through `sendProactivePush`.** Rejected: couples a
  one-shot version-keyed event to a per-day budget, drops release notes on days
  a tip already went out, and creates a per-boot retry loop because the
  watermark only advances on a successful send.
- **A separate "broadcast budget" (e.g. ≤3 sends/user/boot).** The
  `MAX_ANNOUNCEMENTS_PER_USER` cap + `INTRA_USER_DELAY_MS` spacing already live
  in the announcer as UX guardrails; a second budget abstraction in
  `notification-budget.ts` would be ceremony with no extra safety.
- **Fold the broadcast into the proactive path and exempt it with a flag.**
  More conditional logic in the hot proactive path for a surface that runs once
  at boot; cleaner to keep it a distinct path.

## References

- Plan 010 — `docs/plans/done/010-version-broadcast.md`
- ADR 004 — notification architecture (amended by this ADR for the carve-out)
- ADR 003 — portability discipline (announcer is framework-free; stays valid)
- ADR 002 — no `parse_mode` (announcement bodies + `/changelog` are plain text)
