# Plan 011 — Drop subscriptions surface · optional herb link in reminders

**Status:** Approved — not started
**Created:** 2026-06-28
**Approved:** 2026-06-28
**Completed:** —
**Bump on close:** minor

## Context

Two unrelated owner-requested changes, bundled because they were raised together
during a bug-sweep:

1. **Subscriptions are not needed.** The per-category *topic subscriptions*
   surface (🔔/🔕 toggles under Settings → 📂 Подписки and the `/subscriptions`
   command) is dead weight: nothing ever dispatches a per-category digest. The
   `subscription-dispatch.ts` service — despite its name — drives the **daily
   tip** (the `user_settings` daily-tip toggle), *not* this table, so removing
   subscriptions does not touch daily tips (ADR 004 proactive path stays intact).
2. **Optional herb link when creating a reminder.** The create-reminder wizard
   (Plan 008) only links a herb when launched from a herb card's ⏰ Напомнить.
   Starting from scratch (⏰ Напоминания → ➕ Новое) gives no way to attach a
   herb. Add an **optional** herb-link step. `ReminderDraft.herbId` and the DB
   column already exist — this is a UI/flow addition, no schema change.

Related: Plan 007 (navigation shell, ADR 009), Plan 008 (reminder wizard),
ADR 003 (portability), ADR 004 (proactive budget).

## Goals / Non-goals

- **Goals:**
  - Remove the topic-subscriptions UI, command, and repo. Keep the daily-tip path.
  - Add an optional "link a herb (or skip)" step to the create-reminder wizard,
    placed **after** the label step; the label stays free-text and is never
    auto-filled by the herb (owner decision).
- **Non-goals:**
  - **No DB migration.** Per the additive-only rule, the v1 `subscriptions`
    table and the `Subscription` domain types **stay in place** (dead, harmless).
  - No change to the herb-card entry path's existing pre-link + label-default UX
    (Plan 008) — the new herb step is skipped when a herb was pre-linked at entry.
  - No "filter reminders by herb" / no showing the linked herb in the reminders
    list (separate, later).

## Phases

### Phase 1 — Remove the topic-subscriptions surface

- **Deliverables:**
  - Delete `src/bot/commands/subscriptions.ts` and
    `src/db/repositories/subscription.repo.ts` (verify no other importer — only
    `subscriptions.ts` uses the repo; `subscription-dispatch.ts` imports
    `user.repo`, not this).
  - `src/bot/index.ts`: drop the `registerSubscriptionsCommand` import + call.
  - `src/bot/commands/settings.ts`: remove the `subscriptionsButton` row from
    `hubView`, the `set:open:subs` action, and the `subscriptionsEntry` import.
  - `src/index.ts`: remove the `{ command: 'subscriptions', … }` entry from the
    bot command list. **Keep** `startSubscriptionDispatch` (the daily tip).
  - `src/bot/messages.ts`: remove the `subscriptions` block and
    `settings.subscriptionsButton`.
  - **Keep**: `CREATE TABLE subscriptions` (v1 baseline) in `schema.ts`, the
    `Subscription` types in `notifications/types.ts` / `services/notifier.ts`,
    and `subscription-dispatch.ts`. Add a one-line code comment on the table /
    dispatch file noting the topic-subscriptions UI was retired in Plan 011 while
    the table is retained under the additive-only rule.
- **Acceptance:** `typecheck`, `lint`, `test`, `build` green; no dangling imports
  of the deleted files; Settings hub shows tip-toggle / Поддержать / Обратная
  связь only; `/subscriptions` is gone from the command list; daily tip still
  dispatches.

### Phase 2 — Optional herb-link step in the create-reminder wizard

- **Deliverables:**
  - `reminder-create.ts`:
    - Add `'herb'` to `ReminderStep`; insert it into every `stepsFor(...)`
      sequence **between `label` and `kind`**, but **only when the herb was not
      pre-linked at entry** (herb-card path skips it). Track this with a draft
      flag (e.g. `herbPrelinked?: boolean`) set in `reminderCreateEntry` when
      `opts.herbId` is supplied; thread it into `stepsFor`.
    - New `herbView`: a **paginated** picker over `deps.content.herbs.all`
      (stable order, ~8/page) with a `Пропустить` (skip) button and the standard
      back/cancel nav. Callbacks: `rc:herb:<id>` (pick → set `herbId`, advance to
      `kind`), `rc:herb:skip` (leave `herbId` unset, advance), `rc:hpg:<n>`
      (page). All run through `assertCallbackData` (herb ids are short, ≤64 B).
    - Action handlers for the three callbacks via `requireSessionAndAnchor`.
    - Confirm screen: show the linked herb's name when `herbId` is set.
  - `messages.ts`: `reminderCreate.herbPrompt`, `.herbSkip`, and a helper to
    render the linked-herb line on confirm. Reuse `messages.nav.prev/next/position`
    for the pager.
- **Acceptance:** From ➕ Новое: label → herb picker (pick or skip) → kind → … →
  confirm shows the linked herb when picked; skip yields a herb-less reminder.
  From a herb card: unchanged (herb pre-linked, picker step skipped). Unit tests
  for `stepsFor` (herb step present/absent by pre-link flag) and the herb-page
  slicing helper. `typecheck`/`lint`/`test`/`build` green.

## Risks / Open questions

- **Pager callback budget.** `rc:hpg:<n>` + `rc:herb:<id>` must stay ≤64 B —
  guard with `assertCallbackData`; herb ids are short stable slugs.
- **Two `bot.on('text')` capturers** (reminder-create label, feedback) are
  unaffected — the herb step is button-driven, no free text.
- **Dead table drift.** Keeping `subscriptions` means a generated/CI artifact
  could later flag it as unused; it is intentional — the code comment records why.

## Verification

- `npm run typecheck && npm run lint && npm test && npm run build`
- Manual: Settings hub no longer offers Подписки; `/subscriptions` unknown;
  daily tip still fires (toggle on, force a tick). Create a reminder from ➕
  Новое and confirm the herb step appears, both pick and skip work, and confirm
  reflects the choice; create one from a herb card and confirm the step is skipped.

## Progress

- [ ] Phase 1 — Remove subscriptions surface (commit hash on completion)
- [ ] Phase 2 — Optional herb-link step (commit hash on completion)
