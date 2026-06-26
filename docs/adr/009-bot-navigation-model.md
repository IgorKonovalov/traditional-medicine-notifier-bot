# ADR 009 — Bot navigation model: persistent menu, anchor-edit sessions, gated surfaces

**Date:** 2026-06-26
**Status:** Accepted

## Context

The bot today is a flat set of nine slash commands with **no menu and no
back-navigation**. A user discovers features only by typing `/` and reading the
command list; every step sends a **new message** (browse → herb list → herb card
all pile up in the chat); and forward-only flows (`herb → ⏰ Напомнить`) dead-end
because the create-reminder step was never built. As the surface grows — a
library over a large corpus, a multi-step reminder wizard, long-form guides
(ADR 008), richer settings — "type a command and scroll" stops scaling.

A sibling project (`serbian-language-bot`) has solved the same problem with a
small, proven interaction kit. We want to adopt that model deliberately and
record it, because navigation is **costly to reverse**: once users learn a menu
and once dozens of handlers share a routing/render convention, changing the
spine is a wide refactor.

Forces specific to this project:

- **Renderer-agnostic content (ADR 002).** Content bodies carry no Telegram
  markup or `parse_mode`. Any chrome we add (menus, buttons, breadcrumbs) is a
  **bot-layer** concern and must not leak formatting rules into `content/`.
- **Doctor-gate on combinations (ADR 006).** The large Tibetan-formula corpus is
  non-sanitised staging data behind a hard production gate. A navigation model
  that exposes the library must be able to **hide an entire branch in
  production** without removing it from the build.
- **Portability discipline (ADR 003).** No Telegraf outside `src/bot/`; the
  navigation kit lives entirely in the bot layer.
- **Two existing stateful needs already on the roadmap** — the guides pager
  (ADR 008 / Plan 006) and the create-reminder wizard — will each invent session
  state and callback routing unless a shared convention exists first.

## Decision

Adopt a **persistent reply-keyboard main menu + inline drilldown** as the bot's
navigation spine, with an **anchor-message edit-in-place** session model and a
shared **callback prologue**. Keep rendering **plaintext + emoji (no
`parse_mode`)**, consistent with current code and ADR 002.

1. **Persistent main menu (reply keyboard).** A `mainMenuKeyboard()` built with
   `Markup.keyboard().resize().persistent()` stays visible at the bottom. Its
   buttons (e.g. `📚 Библиотека`, `⏰ Напоминания`, `💡 Советы`, `⚙️ Настройки`,
   `❓ Помощь`) are routed by **exact-match** `bot.hears(exact(LABEL), …)` to the
   same entry functions the slash commands call. Menu labels and the
   `exact()`/`MENU` constants live in `src/bot/keyboards.ts` + `messages.ts`.

2. **Inline drilldown with universal back/home.** Within a section, navigation
   uses inline buttons. Every non-root screen carries a `« Назад` row, and deep
   screens may carry a home affordance back to the section root. Lists that
   exceed a screen paginate with `◀ ▶` + a position indicator.

3. **Anchor-message edit-in-place.** A browse/multi-step flow sends **one**
   message (the *anchor*) and **edits it** (`editMessageText`) on each
   transition, instead of sending a new message per step. This keeps the chat
   clean and binds a session to a single `message_id`. Voice/media or
   `splitForTelegram` overflow (ADR 008) are the only sanctioned exceptions
   (they send a sibling message).

4. **Shared session + callback kit.** Reuse the existing `bot_sessions` table and
   `session-store.ts`; sessions are keyed by **internal `user_id`** (never
   Telegram id, ADR 003). A `requireSessionAndAnchor()` **callback prologue**
   validates the user, the live session, and that the tapped message **is** the
   session's anchor — stale taps `answerCbQuery()` silently and no-op. Callback
   data follows `<scope>:<action>:<arg?>` and **must stay within Telegram's
   64-byte limit** (use stable content `id`s + indices, never titles).

5. **Gated surfaces.** A navigation branch can be hidden behind a runtime config
   flag. Specifically, the **combinations (formula) browser is built but gated**:
   a `FEATURE_COMBINATIONS_BROWSER` config (default **off** in production)
   controls whether the library shows the formula branch. This satisfies ADR 006
   — the surface is reviewable in staging and ships dark until the owner's
   documented medical sign-off.

6. **Render stays plaintext.** UI chrome uses plain text + emoji and **no
   `parse_mode`**, matching `src/bot/render/markdown.ts` today. The render-time
   disclaimer (ADR 006) continues to be appended by the bot on medicine cards.
   (Adopting HTML chrome later is possible but is a separate, explicitly-scoped
   decision — not assumed here.)

Concrete surface a reviewer can grep against: `src/bot/keyboards.ts`
(`mainMenuKeyboard`, `MENU`, `exact`, `backRow`), `src/bot/menu-router.ts`
(hears-routing), `src/bot/commands/_callback-prologue.ts`
(`requireSessionAndAnchor`), `src/bot/render/markdown.ts` (anchor edit helpers),
`src/bot/session-store.ts` (`SessionKind`s), `src/config.ts`
(`FEATURE_COMBINATIONS_BROWSER`), and `messages.ts` for all Russian strings.

## Consequences

- **Easier:** a discoverable, always-present menu; clutter-free multi-step flows;
  one routing/render/validation convention that the reminder wizard (Plan 008),
  the library (Plan 009) and the guides pager (Plan 006) all reuse instead of
  each reinventing; a clean mechanism to ship the combinations corpus dark.
- **Harder:** every new screen now owes a back/home affordance and a prologue
  check; `callback_data` must be budgeted (64 bytes); session lifecycle
  (creation, anchor capture, TTL/expiry, cleanup on menu tap) becomes a shared
  concern that must be got right once in the foundation.
- **Every future change must:** route menu taps through exact-match to the shared
  entry functions; validate callbacks via the prologue; keep chrome out of
  `content/` bodies (ADR 002); key sessions by internal `user_id` (ADR 003); and
  keep any not-yet-cleared corpus behind its gate (ADR 006).

## Alternatives considered

- **Inline-only `/menu` hub (no reply keyboard).** A single hub message of inline
  buttons. Rejected as the primary spine: the menu isn't always one tap away
  (it scrolls out of view), forcing users back to typing `/menu`. The reply
  keyboard is persistent by construction. (Inline hubs are still used *within*
  sections.)
- **Keep commands-only, just add back buttons.** Least change, but leaves
  discovery to `/`-typing and doesn't address chat clutter; the headline reminder
  and library surfaces need real sessions regardless.
- **Adopt an FSM/scene library (e.g. Telegraf Scenes/WizardScene).** Rejected:
  pulls a heavier Telegraf-coupled abstraction into flows when the existing
  `bot_sessions` + a thin prologue already cover our needs; the sibling bot
  reaches the same UX with plain maps and is easy to reason about.
- **HTML `parse_mode` chrome from day one.** Deferred: it buys nicer typography
  but adds an escaping burden and a divergence from current plaintext rendering;
  not required for menus/pagers. Revisit as its own decision if needed.

## References

- ADR 002 (renderer-agnostic content) · ADR 003 (portability; internal-id
  sessions) · ADR 004 (proactive budget — unaffected) · ADR 006 (doctor-gate,
  render-time disclaimer) · ADR 008 (guides pager — first consumer of this kit).
- Implementation: **Plan 007** (navigation shell — this ADR's operationaliser),
  then **Plan 008** (reminder-create flow) and **Plan 009** (library browser)
  build on it; **Plan 006** (guides) should target the shared kit once 007 lands.
- Model reference: `serbian-language-bot` (`src/bot/keyboards.ts`,
  `menu-router.ts`, `commands/_callback-prologue.ts`, `session-store.ts`).
