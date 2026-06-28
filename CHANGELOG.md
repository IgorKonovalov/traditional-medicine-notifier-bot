# Changelog

All notable changes to this project are documented here. The project follows
[Semantic Versioning](https://semver.org/). `package.json` is the source of
truth for the current version.

## 0.7.0 — 2026-06-28

- Post-deploy version broadcast (Plan 010, ADR 010). On boot the bot now pings
  active users about each new minor/major release they haven't seen — a
  multi-version queue (≤3, oldest-first, spaced), gated by a default-off
  `feature_announcements` opt-in with a `priority` bypass, idempotent via a new
  `users.notified_version` column (migration 002) and delivered Notifier-direct,
  exempt from the daily proactive cap (third notification path). Adds a
  `/changelog` command (plaintext release history), a "new features" toggle in
  ⚙️ Настройки, and a version footer in `/help`.

## 0.6.0 — 2026-06-28

- Navigation shell & UX foundation (Plan 007, ADR 009). The bot gains a
  **persistent reply-keyboard main menu** (📚 Библиотека · ⏰ Напоминания ·
  💡 Советы · ⚙️ Настройки · ❓ Помощь) routed by exact match to the same entry
  functions as the slash commands. Browse/search/herb are migrated onto an
  **anchor-edit drilldown** — one message edited in place per session, with
  universal `« Назад`/home and paginated lists — backed by a shared navigation
  kit: anchor render helpers, an `AnchoredSession` model, a
  `requireSessionAndAnchor` callback prologue, and back/home/pager builders with
  a 64-byte `callback_data` guard. Settings becomes a state-reflecting hub;
  `/start` is a stepped, idempotent onboarding; a minimal `/tips` entry backs the
  Советы button.

## 0.5.1 — 2026-06-27

- Sort the content-loader directory walk so corpus traversal — and the
  generated `content/.index/` — is deterministic across platforms.
  `readdirSync` is NTFS-sorted on Windows but inode-ordered on Linux, which
  made `combinations.json` drift on CI. Regenerated the index in canonical
  order and added a regression test.

## 0.5.0 — 2026-06-26

- Restore source fidelity across the Tibetan-formula corpus and remediate the
  doctor review (plan 004): pruned to 150 formulas, re-captured every record
  verbatim from its authoritative source (`research/raw-crawl-verbose-v2.json`,
  manla-canonical for dual-source), added a structured `nature` field and a
  generic combination `category` with the `rinchen-pills` class (ADR 007),
  normalized ingredients (Russian-first) / cautions (de-boilerplated) /
  capitalization, and committed a reproducible review-HTML generator
  (`npm run content:review`). Verbose corpus stays behind the ADR 006 gate.

## 0.4.0 — 2026-06-26

- Add a structured `source` field to daily tips (plan 003): tip provenance now
  lives in frontmatter and is rendered as an `Источник:` line by the bot at send
  time instead of being baked into the body. The 10 «Чжуд-ши» tips carry their
  chapter citation; `tips.json` projects it.

## 0.3.0 — 2026-06-25

- Re-extract the Tibetan formula corpus verbosely (ADR 006): 163
  `content/combinations/` records now carry full source indications, traditional
  use, dosing notes, and verbatim text behind a doctor-review production gate
  (`docs/medical-review.md`). The disclaimer is now appended by the bot at render
  time instead of baked into each content file.

## 0.2.0 — 2026-06-25

- Add the `combinations` content type (ADR 005) and sweep 144 Tibetan compound
  formulas from manla.ru + bimala.ru into `content/combinations/` — descriptive,
  non-prescriptive records with member→herb cross-references.

## 0.1.0 — 2026-06-23

- Initial project skeleton for the traditional-medicine notifier domain.
- Architectural seams in place (Notifier interface, content loader, DB
  migration framework, two-path notification dispatch) with feature bodies
  stubbed.
- Skill set under `.claude/skills/` (architect, dev, ux-telegram,
  content-curator) and seed ADRs under `docs/adr/`.
