# Changelog

All notable changes to this project are documented here. The project follows
[Semantic Versioning](https://semver.org/). `package.json` is the source of
truth for the current version.

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
