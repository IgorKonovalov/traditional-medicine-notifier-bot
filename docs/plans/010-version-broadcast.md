# Plan 010 — Post-deploy version broadcast ("what's new")

**Status:** Draft
**Created:** 2026-06-28
**Completed:** —
**Bump on close:** minor

## Context

We want **every user-facing change to be broadcast the same way the sibling
`serbian-language-bot` does it**: each plan-close that bumps the minor/major
version writes one short Russian "what's new" line, and on the next container
boot the bot delivers it once to every active user who hasn't seen it yet.
Patch bumps stay silent. A `/changelog` command shows the running history, and
a settings toggle lets users opt out (default **off** — strict opt-in, matching
how `daily_tip` works here).

This is a straight port of serbian's version-broadcast system at **full
parity**, adapted to this bot's substrate and conventions. Serbian grew the
feature across plans 025 (core broadcast), 026 (active flag), 042 (opt-in
toggle), 043 (`/changelog`), and 067 (multi-version queue + CTA + priority
bypass). We land the consolidated end-state in one plan because the substrate
this bot needs from those plans **already exists**:

- `src/services/notifier.ts` — the `Notifier` interface, a tri-state
  `SendResult` (`'ok' | 'permanent-failure' | 'transient-failure'`), an
  `open-herb` `NotificationCta`, and (in `src/bot/notifier.ts`) the
  `active = 0` flip on permanent failure. **Already done** (serbian's plan 026).
- `users.active` flag + `markInactive` / `listActiveUserIds`. **Already done.**
- `user_settings` typed kv store + `getSetting`/`setSetting`. **Already done** —
  this is where the opt-in lives (serbian uses the same pattern).
- `CHANGELOG.md`, maintained per-version by the plan-close ritual.
  **Already done** — this plan does *not* change the changelog workflow.
- An anchored settings hub (`settings.ts`, ADR 009) with a working toggle row
  (`daily_tip`) to clone.
- A global `herb:<id>` callback handler (`commands/herb.ts`) that the reminder
  CTA already reuses — announcement CTAs reuse it too, so **no dedicated
  `announce:` action handler is needed** (a simplification over serbian's
  `announce:lesson:` handler).

**Two adaptations from serbian are load-bearing and called out throughout:**

1. **Plaintext, not HTML.** Serbian's `/changelog` and announcement bodies use
   `<b>…</b>` via `replyHtml`. This bot is **plaintext, no `parse_mode`**
   (ADR 002). The changelog renderer and every announcement string must carry
   emphasis with emoji/spacing only — no markup.
2. **Daily-cap exemption.** ADR 004 currently says *"any new proactive surface
   must route through `sendProactivePush`"* (the ≤1-push/day gate). The
   post-deploy broadcast must **bypass** that cap — like solicited reminders do
   — because it is a one-shot-per-version event, made idempotent by a per-user
   `notified_version` column, not by the daily budget. This makes ADR 004's
   blanket rule false, so this plan ships an ADR (see Phase 4).

Related: ADR 003 (portability — the announcer is a `src/services/` module and
stays Telegraf-free), ADR 004 (notification paths + cap), ADR 009 (navigation).

## Goals / Non-goals

- **Goals:**
  - `getVersion()` single-source helper reading `package.json`.
  - `notified_version` column on `users` (migration 002), backfilled so
    existing users are *not* retro-pinged.
  - `feature_announcements` opt-in in `user_settings` (default off), surfaced as
    a toggle in the settings hub.
  - `version-announcer` service: boot-time, walks active users behind current
    version, delivers a **multi-version queue** (≤3, oldest-first, spaced by
    `INTRA_USER_DELAY_MS`), honours **priority bypass** of the opt-in gate,
    handles permanent/transient failures, idempotent via `notified_version`.
  - `versionAnnouncements` map (Russian, plaintext) + boot-time CTA validation.
  - `/changelog` command (plaintext, budgeted, descending semver).
  - `/help` shows the current version.
  - Boot wiring in `index.ts`.
  - ADR for the daily-cap exemption; architect close-ritual updated to author a
    `versionAnnouncements` entry on minor/major bumps.
- **Non-goals:**
  - Changing the `CHANGELOG.md` authoring workflow (already in place).
  - Admin-triggered ad-hoc broadcasts (serbian's `/announce` admin command is
    **not** in scope — only the version-keyed map).
  - Opt-out for *solicited* reminders or daily tips (separate settings, untouched).
  - Per-locale strings (Russian-only), rich formatting (buttons beyond the
    single reused `open-herb` CTA), web-facing changelog.
  - Retroactive pinging of pre-feature users.

## Phases

### Phase 1 — Version plumbing + schema

- **Deliverables:**
  - `src/utils/version.ts` — `getVersion(): string` (reads `package.json` via
    `fs` relative to `__dirname`, cached) + `__resetVersionCacheForTests()`.
    Port verbatim from serbian; the `../../package.json` path holds (both repos
    run the file two levels below root under `tsx` and `dist`).
  - `src/utils/version.test.ts`.
  - **Migration 002** in `src/db/schema.ts`:
    - `ALTER TABLE users ADD COLUMN notified_version TEXT;`
    - Backfill: `UPDATE users SET notified_version = ?` with the **current**
      `getVersion()` at migration time, so existing users start "current" and
      only get pinged on the *next* minor bump (serbian plan 025 D4). The
      migration fn must accept/read the version; pass it in rather than importing
      to keep `schema.ts` dependency-light (mirror how the version string
      reaches the migration in serbian — read `getVersion()` in the migration
      body is acceptable here since `utils/version.ts` is dependency-free).
    - Bump `LATEST_VERSION` to 2; append to `MIGRATIONS`.
  - `src/db/repositories/user.repo.ts`:
    - `SETTING_FEATURE_ANNOUNCEMENTS = 'feature_announcements'` constant.
    - `interface VersionCandidate { id; notifiedVersion: string | null; optedIn: boolean }`.
    - `findActiveUsersBehindCurrentVersion(currentVersion): VersionCandidate[]`
      — `users` LEFT JOIN `user_settings` on `key = 'feature_announcements'`,
      `WHERE active = 1 AND (notified_version IS NULL OR notified_version != ?)`,
      projecting `optedIn = (value === '1')`.
    - `markNotified(userId, version): void`.
    - `getFeatureAnnouncementsEnabled(userId): boolean` (reads the setting).
  - Unit tests in `src/db/schema.test.ts` (migration idempotency + backfill) and
    `user.repo` tests for the new query (active filter, behind-version filter,
    opt-in projection).
- **Acceptance:** migration runs idempotently; a fresh user gets
  `notified_version = current`; the candidate query returns only active users
  behind current with the right `optedIn` bit; `getVersion()` returns the
  `package.json` string.

### Phase 2 — Announcer service + announcement map

- **Deliverables:**
  - `src/services/notifier.ts` — **additive**: add
    `interface AnnouncementMessage { body: string; cta?: NotificationCta; priority?: boolean }`.
    No change to `NotificationPayload` (already `{ body; cta? }`) or
    `SendResult`. Stays Telegraf-free (ADR 003).
  - `src/services/version-announcer.ts` — port from serbian, adapted:
    - `announceNewVersion({ currentVersion, announcements, notifier, logger, sleep?, rateLimitMs? })`.
    - `classifyDelta` (null/major/minor → `ping`, else `skip`), `collectQueue`
      (ascending semver, strictly-newer-than-notified, ≤ current, drop empty
      bodies), `MAX_ANNOUNCEMENTS_PER_USER = 3`, `INTRA_USER_DELAY_MS = 1500`,
      `DEFAULT_RATE_LIMIT_MS = 100`.
    - `sendQueue`: per-send `markNotified` advance; permanent → `markNotified`
      to current + bail; transient → resume from last delivered next boot.
    - Opt-in filter: non-priority entries dropped when `!user.optedIn`;
      `priority === true` bypasses.
    - `validateAnnouncements(announcements, content)` — boot-time check that
      every `open-herb` CTA points at a herb that exists in the content index
      and the resulting `herb:<id>` callback is ≤64 bytes. **Adapt the CTA kind
      from serbian's `open-grammar-lesson`/`announce:lesson:` to this bot's
      `open-herb`/`herb:<id>`.** The validator's content contract is the slice
      of the herb index it needs (`{ herbs: { byId: ReadonlyMap } }` or the
      existing loaded-content shape).
  - `src/services/version-announcer.test.ts` — port the matrix: patch-silence,
    minor-broadcast, multi-version queue cap + ordering, intra-user spacing
    (via `sleep` seam), opt-out filters non-priority, priority bypasses opt-out,
    permanent-marks-current, transient-resumes-from-last, empty-queue-marks-and-warns,
    CTA validator rejects missing herb / oversized callback.
  - `src/bot/messages.ts` — add `versionAnnouncements: Record<string, string | AnnouncementMessage>`
    and (Phase 3) the changelog renderer. **Decision:** keep both in a new
    `src/bot/messages/version-announcements.ts` module re-exported from
    `messages.ts` (serbian split this out at ~500 lines; `messages.ts` is 235
    lines today, but the map grows one entry per minor and the renderer is ~60
    lines — pre-splitting avoids a churny move later). Seed the map **empty**
    (no entry for ≤ current `0.x`); the first real entry is this plan's own
    minor bump, authored at close (see Phase 4).
- **Acceptance:** announcer test matrix green; `announceNewVersion` against a
  seeded DB with a stale active user + a matching entry sends exactly the
  expected message(s) and marks them notified; patch-only delta sends nothing;
  `validateAnnouncements` throws on a bad CTA.

### Phase 3 — `/changelog`, settings toggle, `/help` version, boot wiring

- **Deliverables:**
  - `src/bot/messages/version-announcements.ts` — `changelogMessages` with a
    **plaintext** `render(announcements)`: descending semver sort, normalized
    `▸ X.Y.Z` headers, budgeted accumulation (`CHANGELOG_BUDGET = 3800`,
    truncation marker for older entries). **Strip serbian's `<b>` tags** — use
    plain `▸ X.Y.Z` headers with newlines. CTAs stripped (point-in-time only).
  - `src/bot/commands/changelog.ts` — `runChangelogEntry(ctx)` replies the
    rendered text via the **plaintext** reply path (the bot's normal `ctx.reply`
    / anchor plaintext helper, **not** an HTML helper), `registerChangelogCommand(bot)`.
    Register in `src/bot/index.ts`; add to `setMyCommands` in `index.ts`; add a
    `/changelog` line to the `/help` body in `messages.ts`.
  - `src/bot/commands/settings.ts` — add a second toggle row for
    `feature_announcements` (clone the `daily_tip` row: `set:ann:toggle`,
    state-reflecting label вкл ✅ / выкл 🔕, `✓` confirmation line on change).
    Add the label + confirmation strings to `messages.settings`.
  - `src/bot/commands/help.ts` / `messages.ts` — append the current version to
    the `/help` body via `getVersion()` (e.g. a `Версия X.Y.Z` footer line).
  - `src/index.ts` boot wiring: after `loadContent`, before `bot.launch()`, call
    `validateAnnouncements(messages.versionAnnouncements, content)` (fail-fast),
    then `await announceNewVersion({ currentVersion: getVersion(), announcements:
    messages.versionAnnouncements, notifier, logger })`. Order vs. dispatch crons
    doesn't matter; it doesn't need polling live.
  - Tests: `changelog.test.ts` (render budget/ordering/empty +
    `TELEGRAM_REPLY_CAP` regression guard kept in sync with `CHANGELOG_BUDGET`),
    settings toggle test (label reflects state, toggle persists + re-renders).
- **Acceptance:** `/changelog` renders newest-first plaintext within the reply
  cap; settings hub shows the announcements toggle reflecting stored state and
  flips it; `/help` shows the version; boot calls the announcer once and is a
  no-op when every active user is current.

### Phase 4 — ADR, close-ritual doc, validate

- **Deliverables:**
  - **ADR 010 — "Post-deploy version broadcast bypasses the daily cap."**
    Amends ADR 004: introduces the broadcast as a **third** notification path
    (alongside solicited + proactive), delivered Notifier-direct, **not** through
    `sendProactivePush`; idempotent via per-user `notified_version`; rationale =
    a one-shot-per-version event should not be suppressed by (or consume) a
    user's daily tip budget. Set ADR 004 status note pointing to ADR 010 for the
    carve-out (do not rewrite ADR 004 in place beyond the pointer). Confirm ADR
    003 stays valid (announcer is framework-free; `AnnouncementMessage` is an
    additive domain type) — note it, no successor.
  - Update `.claude/skills/architect/SKILL.md` "Closing a plan": on a
    **minor/major** bump, also add a one-sentence Russian
    `versionAnnouncements['X.Y.Z']` entry (plaintext, ≤~15 words, emoji ok), and
    use `priority: true` only for structurally important changes (new top-level
    command, destructive change). Patch bumps add nothing.
  - Update `CLAUDE.md` notification-model section: document the third path
    (post-deploy broadcast, not budget-gated) and point to plan 010 / ADR 010.
  - `docs/architecture/architecture.md` — refresh the notification/boot
    description if it enumerates paths (refreshed in the close commit per the
    architect review ritual).
  - Validate: `npm run typecheck && npm run lint && npm test && npm run build`,
    plus a local dry-run of the announcer against a 2-user seeded DB.
- **Acceptance:** ADR 010 committed and ADR 004 points to it; close-ritual doc
  updated; all gates green; dry-run delivers to the stale seeded user only.

## Risks / Open questions

- **Daily-cap interaction (resolved by ADR 010).** Broadcast is exempt;
  documented so a future reader doesn't "fix" it by routing through the gate.
- **Author forgets the `versionAnnouncements` entry on a minor bump.** Announcer
  logs a warning and marks notified anyway (no retry loop). Mitigation: the
  close-ritual checklist (Phase 4).
- **CTA points at a renamed/removed herb id.** `validateAnnouncements` fails
  fast at boot rather than silently failing per-recipient. Content ids are
  stable join keys (CLAUDE.md), so this is rare.
- **Plaintext changelog growth.** Budgeted truncation keeps it under the reply
  cap; keep `CHANGELOG_BUDGET` and the test's `TELEGRAM_REPLY_CAP` in sync.
- **Migration backfill baseline.** Must read the version *at migration time*; if
  the column is added but backfill is skipped, the next boot would ping every
  existing user. Covered by the schema test.
- **Open:** expose `/changelog` in the persistent reply-keyboard menu too? The
  menu is full (5 buttons, ADR 009). **Recommendation:** slash command + `/help`
  link + Telegram `/` menu only; skip the reply keyboard. (Decide at review.)

## Verification

1. `npm run typecheck && npm run lint && npm test && npm run build` — all green.
2. Seed a local DB: user A `notified_version` stale + opted in, user B current,
   user C stale + opted out. Add a non-priority `versionAnnouncements` entry for
   the current version. Boot → only A receives it; B and C untouched; A marked
   current. Flip the entry to `priority: true`, reset A and C stale → both
   receive it.
3. Multi-version: seed A behind by 4 minors with 4 entries → A gets the most
   recent 3, oldest-first, spaced.
4. `/changelog` in chat → newest-first plaintext list within the cap.
5. `/settings` → toggle "Уведомления о новых функциях" on/off; verify the
   `user_settings` row and the re-rendered label.
6. `/help` → shows `Версия X.Y.Z`.
7. Patch-bump boot (no map entry) → zero sends, users still marked current.

## Progress

- [x] Phase 1 — Version plumbing + schema (`eeae095`)
- [ ] Phase 2 — Announcer service + announcement map
- [ ] Phase 3 — `/changelog`, settings toggle, `/help` version, boot wiring
- [ ] Phase 4 — ADR, close-ritual doc, validate
