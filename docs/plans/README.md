# Plans

Implementation plans authored by the **architect** skill drive all non-trivial
work. Each plan is `NNN-short-name.md` (zero-padded), reviewed and approved
before the **dev** skill implements it, then moved to `done/` on close.

- **Next free number:** `018` (017 is taken)
- **Completed:** see `done/`

### Active roster

| Plan | Title | Status |
|---|---|---|
| 004 | Formula doctor-review remediation | Draft |
| 007 | Navigation shell & UX foundation | Completed → `done/` |
| 008 | Reminder-create flow | Completed → `done/` |
| 009 | Library browser (gated formulas) | **Completed** → `done/` (v0.11.0) — formulas gate lifted on owner sign-off |
| 011 | Drop subscriptions · optional herb link in reminders | Completed → `done/` (v0.10.0) |
| 012 | Tip sourcing reconciliation + content voice tightening | Completed → `done/` (v0.12.0) |
| 013 | Foods content type · constitution portraits · diagnosis | Approved — Phases 1–4 unblocked; Phase 5 narrowed to diagnosis only (rhythms shipped as `tib-sutochnyj-ritm` + `tib-sezonnoe-pitanie`), revised 2026-06-29 |
| 015 | Hide the Chinese tradition (Tibetan-only surface) | Completed → `done/` (v0.16.0, ADR 013) |
| 016 | Foundational theory guides | Completed (Wave 1) → `done/` (v0.17.0); Waves 2–3 deferred to backlog |

### UI overhaul plan set (007–009)

Three stacked plans, modelled on `serbian-language-bot`'s interaction kit and
governed by **ADR 009** (bot navigation model). They are sequential:

- **007 — Navigation shell** is the foundation: persistent reply-keyboard menu,
  anchor-message edit-in-place sessions, callback prologue, back/home + pager
  kit, settings hub, and onboarding refresh. **Must land first** — 008 and 009
  build on its kit.
- **008 — Reminder-create flow** wires the half-built headline feature (the
  multi-step create wizard) onto the shell.
- **009 — Library browser** unifies herbs/tips/guides under `📚 Библиотека` with
  rich cross-linked cards; the combinations browser was built **last and held
  back** behind the ADR 006 doctor-gate (`FORMULA_BRANCH_ENABLED`). **Closed at
  v0.11.0; the gate was lifted on the owner's sign-off**, so the 🧪 Формулы branch
  is now live (minimal field set — `docs/medical-review.md`).

`📖 Статьи` (guides) and `💡 Советы` (tips browse) branches of the library are
owned by **Plan 006** and **Plan 005** respectively; Plan 006 should retarget the
Plan 007 shared nav kit once 007 lands.

## Standing backlogs

- **`guide-backlog.md`** — the long-form **guide** candidate menu (was
  `006-guide-candidates.md`). Not a numbered plan; later guide plans (006, 013,
  016) draw waves from it and tick rows back. Check here before planning new guides.

## Other candidates (not yet planned)

- **Elderly nutrition & lifestyle guide** — гл. 6 of «Наука о здоровье»
  (Сова Ригпа book); descoped from Plan 013 to backlog. Pregnancy/children (гл. 5)
  is **excluded** (quasi-medical claims), not backlog.
- Edit-an-existing-reminder (follow-up to Plan 008; v1 is create + cancel).
- Per-user timezone (reminders currently use the bot-wide tz).
- Per-category proactive digests. The `subscriptions` table is retained, but its
  UI and repo (`listSubscribers` et al.) were removed in Plan 011 — a digest
  feature would re-add the access layer.
- Admin `/stats` command (the `adminTelegramIds` allowlist is already wired).
- Feedback admin-routing (today logs to stdout).
