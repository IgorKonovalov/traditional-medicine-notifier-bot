# Plans

Implementation plans authored by the **architect** skill drive all non-trivial
work. Each plan is `NNN-short-name.md` (zero-padded), reviewed and approved
before the **dev** skill implements it, then moved to `done/` on close.

- **Next free number:** `010`
- **Completed:** see `done/`

### Active roster

| Plan | Title | Status |
|---|---|---|
| 004 | Formula doctor-review remediation | Draft |
| 005 | Expand daily tips | Approved — not started |
| 006 | Long-form guides | Approved — not started |
| 007 | Navigation shell & UX foundation | Implemented — pending review |
| 008 | Reminder-create flow | Approved — not started |
| 009 | Library browser (gated formulas) | Approved — not started |

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
  rich cross-linked cards; the combinations browser is built **last and held
  back** — not registered into the hub until the owner's documented medical
  sign-off (ADR 006 doctor-gate; no runtime flag).

`📖 Статьи` (guides) and `💡 Советы` (tips browse) branches of the library are
owned by **Plan 006** and **Plan 005** respectively; Plan 006 should retarget the
Plan 007 shared nav kit once 007 lands.

## Other candidates (not yet planned)

- Edit-an-existing-reminder (follow-up to Plan 008; v1 is create + cancel).
- Per-user timezone (reminders currently use the bot-wide tz).
- Per-category proactive digests (the `subscriptions` table + `listSubscribers` are ready).
- Admin `/stats` command (the `adminTelegramIds` allowlist is already wired).
- Feedback admin-routing (today logs to stdout).
