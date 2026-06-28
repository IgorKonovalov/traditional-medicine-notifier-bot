# Plan 007 — Navigation shell & UX foundation

**Status:** Approved — not started
**Created:** 2026-06-26
**Approved:** 2026-06-26
**Bump on close:** minor (new persistent menu + reworked navigation are user-facing)

## Context

The bot is nine flat slash commands with **no menu and no back-navigation**.
Discovery is "type `/` and read the list"; every step sends a **new message**
(`/browse` → tradition picker → herb list → herb card stack up); forward-only
flows dead-end (`herb → ⏰ Напомнить` has no next step). This does not scale to
the library, reminder wizard, guides, and richer settings the owner wants.

**ADR 009** decided the model — a **persistent reply-keyboard main menu** with
**inline drilldown + universal back/home**, an **anchor-message edit-in-place**
session model, a shared **callback prologue**, plaintext rendering (no
`parse_mode`, ADR 002), and **gated branches** (ADR 006). This plan builds that
foundation and migrates the existing surfaces onto it. It is the base every
later UI plan (008 reminders, 009 library, 006 guides) stacks on.

The interaction kit is modelled on `serbian-language-bot`
(`keyboards.ts`, `menu-router.ts`, `commands/_callback-prologue.ts`,
`session-store.ts`), adapted to this bot's plaintext rendering and internal-id
sessions.

**Related:** operationalises **ADR 009**; honors **ADR 002** (no markup in
content), **ADR 003** (no Telegraf outside `src/bot/`; sessions keyed by internal
`user_id`), **ADR 006** (gated combinations, render-time disclaimer). Unblocks
**Plan 008** and **Plan 009**; **Plan 006** (guides) should retarget the shared
kit once this lands.

## Goals / Non-goals

- **Goals:**
  - A persistent main-menu reply keyboard, always visible, routing to the same
    entry functions as the slash commands.
  - A reusable navigation kit: anchor render helpers (send/edit), `SessionKind`
    extensions, a `requireSessionAndAnchor()` callback prologue, `backRow()`/home
    and pager helpers, and a documented `<scope>:<action>:<arg>` callback
    convention within the 64-byte budget.
  - Existing browse/search/herb surfaces migrated onto anchor-edit + back/home so
    the chat stays clean and every screen can navigate back.
  - A **Settings hub** with dynamic state-reflecting labels, folding today's
    daily-tip toggle and exposing reminder-time/timezone and a subscriptions
    entry point.
  - A multi-step **onboarding** (`/start`) that uses the new primitives and lands
    the user on the menu.
  - ~~A `FEATURE_COMBINATIONS_BROWSER` config flag plumbed~~ — **dropped after
    implementation** (owner decision, 2026-06-28): the bot is private and
    pre-launch, so the combinations browser will instead be held back by simply
    not building/registering it until sign-off (ADR 006). Plan 009 retargeted.
  - All gates green; menu commands registered via `setMyCommands`.
- **Non-goals:**
  - **No** reminder-create wizard (Plan 008) and **no** library redesign or
    combinations browser UI (Plan 009) — this plan only plumbs the flag and
    leaves clean entry points.
  - No guides work (Plan 006 retargets later).
  - No switch to HTML `parse_mode` (ADR 009 keeps plaintext).
  - No new content types or content authoring.
  - No subscription/tips **redesign** — Settings only links to the existing
    surfaces; their rework is a later plan.

## Phases

### Phase 1 — Main menu + router + command registration
*Owner: dev (with ux-telegram review of labels/wording).*
- **Deliverables:**
  - `src/bot/keyboards.ts`: `MENU` label constants, `exact(label)` matcher,
    `mainMenuKeyboard()` (`Markup.keyboard().resize().persistent()`). Initial
    buttons: `📚 Библиотека`, `⏰ Напоминания`, `💡 Советы`, `⚙️ Настройки`,
    `❓ Помощь`. All strings via `messages.ts`.
  - `src/bot/menu-router.ts`: register `bot.hears(exact(MENU.X), handler)` for
    each button, dispatching to the **existing** entry functions (Библиотека →
    current `/browse` entry for now; Напоминания → `/reminders`; Советы → a tips
    entry; Настройки → `/settings`; Помощь → `/help`). Disposes active sessions
    before dispatch (defense in depth).
  - `src/bot/index.ts`: install the router; `setMyCommands` refreshed so the
    slash list and menu agree.
  - `/help` updated to mention the menu and current commands.
- **Acceptance:** menu appears after `/start` and `/help`; each button reaches the
  same screen as its command; typing the command still works; `npm run lint`
  passes the no-Telegraf-outside-`src/bot/` rule; menu strings only in
  `messages.ts`.

### Phase 2 — Navigation kit: anchor render, sessions, callback prologue
*Owner: dev.*
- **Deliverables:**
  - `src/bot/render/markdown.ts` (or a new `render/anchor.ts`): `sendAnchor(ctx,
    body, keyboard)` and `editAnchor(ctx, body, keyboard)` wrappers over
    reply/`editMessageText` that capture/return `{ message_id }` and clamp via the
    existing length logic. No `parse_mode`.
  - `src/bot/session-store.ts`: extend `SessionKind` (reserve `'browse'`,
    `'library'`, `'reminder-create'`, `'settings'`); store anchor coords
    `{ message_id }` + per-flow state; TTL eviction; keyed by internal `user_id`.
  - `src/bot/commands/_callback-prologue.ts`: `requireSessionAndAnchor(ctx, kind)`
    returning `{ user, session } | null` — validates user, live session, and that
    `callbackQuery.message.message_id === session.anchor.message_id`; stale taps
    `answerCbQuery()` and no-op.
  - `src/bot/keyboards.ts`: shared `backRow(cb)`, `homeRow(cb)`, and a
    `pager(prefix, index, count)` builder (◀ ▶ + indicator) for reuse.
  - Document the `<scope>:<action>:<arg>` convention + 64-byte rule in a short
    comment block and in `CLAUDE.md` (Phase 6).
- **Acceptance:** unit tests for the prologue (no user / no session / stale
  anchor / happy path) and for `pager` bounds (no wrap past first/last);
  `callback_data` builders assert ≤64 bytes; `npm test` green.

### Phase 3 — Migrate browse / search / herb onto anchor + back/home
*Owner: dev (with ux-telegram review).*
- **Deliverables:**
  - `src/bot/commands/browse.ts`: tradition picker → herb list → herb card all
    **edit one anchor**; every screen has `« Назад`; long herb lists use `pager`.
  - `src/bot/commands/search.ts`: results render into the anchor as a tappable
    list → card; `« Назад` returns to results.
  - `src/bot/commands/herb.ts`: herb card edits the anchor; keeps the
    `⏰ Напомнить` button (still a stub here — Plan 008 wires it) and a back to the
    originating list; render-time disclaimer preserved (ADR 006).
  - Menu taps / `/start` dispose any open browse session (no orphan anchors).
- **Acceptance:** a full browse → herb → back → search → card walk reuses **one**
  message per session (verified by message-id stability); back never wraps or
  dead-ends; disclaimer still appended on herb cards; stale taps after expiry
  no-op cleanly.

### Phase 4 — Settings hub with dynamic labels
*Owner: dev (with ux-telegram review).*
- **Deliverables:**
  - `src/bot/commands/settings.ts`: an anchor-edited hub whose button labels
    **reflect current state** (e.g. `Совет дня: вкл ✅` / `выкл 🔕`; reminder
    time/timezone display; `Подписки` entry). Pickers edit the anchor in place and
    re-render the hub with a `✓` confirmation line.
  - Fold the existing daily-tip toggle (`SETTING_DAILY_TIP`) into the hub;
    surface the bot timezone (read-only for now) used by dispatch; add entry
    points to **Подписки** (existing `/subscriptions`) and **Помощь/Обратная
    связь/Поддержать** as appropriate.
  - All labels/strings in `messages.ts`; settings reads/writes via the existing
    `user_settings` repo.
- **Acceptance:** toggling the daily tip from the hub persists and the label
  updates on re-render; back returns to menu; no blank-keyboard states; values
  round-trip in the DB; `npm test` green.

### Phase 5 — Onboarding refresh (`/start`)
*Owner: dev (with ux-telegram review of copy).*
- **Deliverables:**
  - `src/bot/commands/start.ts`: a short multi-step start that **edits one
    anchor** — welcome + disclaimer → offer daily-tip opt-in (writes
    `SETTING_DAILY_TIP`) → finish on the main menu with a "что дальше" pointer.
    Existing users (already onboarded) skip to the menu.
  - Honour the non-medical-advice framing; disclaimer surfaced once during start
    (ADR 006 / CLAUDE.md).
- **Acceptance:** first-run shows the stepped onboarding and ends on the menu with
  the tip preference saved; re-running `/start` is idempotent (no duplicate
  state); copy reviewed.

### Phase 6 — Feature flag, validation, docs & close
*Owner: architect.*
- **Deliverables:**
  - ~~`src/config.ts` + `.env.example`: add `FEATURE_COMBINATIONS_BROWSER`~~ —
    **reverted** (owner decision, 2026-06-28). The flag was added then removed;
    the combinations branch is held back by not registering it until sign-off
    (ADR 006), not by a runtime toggle.
  - Full gate run: `typecheck`, `lint`, `test`, `build`, `content:index:check`.
  - Refresh `docs/architecture/architecture.md` (new bot-layer nav kit; menu
    router; flip create-reminder/menu rows as appropriate), `CLAUDE.md`
    (navigation model: persistent menu, anchor-edit, callback convention +
    64-byte rule), and flip **ADR 009** Status to **Accepted** with this plan
    referenced.
  - Semver **minor** bump; `CHANGELOG.md`; move plan to `done/`.
- **Acceptance:** all gates green; docs/ADR reflect the shipped model; plan in
  `done/`.

## Risks / Open questions

- **Migration churn across handlers.** browse/search/herb all change their render
  path at once. Mitigation: land the kit (Phase 2) with tests first, migrate one
  surface at a time, keep slash-command entry points working throughout.
- **Session lifecycle bugs** (orphan anchors, stale taps, TTL). Mitigation: the
  prologue is the single choke point; menu taps and `/start` always dispose; unit
  tests cover the stale-anchor branch.
- **`callback_data` 64-byte budget.** Tradition/herb ids are short, but enforce
  with a builder assertion now so later plans inherit the guard.
- **Reply-keyboard vs. active flows.** When a wizard (Plan 008) is active, menu
  taps must cleanly cancel it. This plan establishes "menu tap disposes
  sessions"; Plan 008 relies on it.
- **Plan 006 (guides) overlap.** Guides also need a pager/session. Recommendation:
  sequence 007 before implementing 006 so guides consume the shared kit rather
  than inventing a parallel one; if 006 starts first, flag and reconcile.
- **Timezone display only.** Editing the timezone is out of scope; the hub shows
  the configured tz read-only. A per-user tz is a later consideration.

## Verification

- `npm run typecheck && npm run lint && npm test && npm run build &&
  npm run content:index:check` — all green.
- Manual: `/start` (stepped onboarding → menu) → tap `📚 Библиотека` → drill to a
  herb card → `« Назад` to list → `❓ Помощь` → `⚙️ Настройки` toggle the daily
  tip (label flips) → confirm one message per session (message-id stable),
  disclaimer on herb cards, stale taps after TTL no-op.
- Unit: prologue branches, pager bounds, `callback_data` length assertions.

## Progress

- [x] Phase 1 — Main menu + router + command registration
- [x] Phase 2 — Navigation kit: anchor render, sessions, callback prologue
- [x] Phase 3 — Migrate browse / search / herb onto anchor + back/home
- [x] Phase 4 — Settings hub with dynamic labels
- [x] Phase 5 — Onboarding refresh (`/start`)
- [x] Phase 6 — Feature flag, validation, docs & close (plan move to `done/` gated on owner review)
