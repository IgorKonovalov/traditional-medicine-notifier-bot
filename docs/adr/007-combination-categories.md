# ADR 007 — Combination categories (rinchen class)

**Date:** 2026-06-26
**Status:** Accepted (amends ADR 005)

## Context

A practitioner reviewing the combination corpus (Plan 004 #4) asked for the
**precious-pill (драгоценные пилюли / Ринчен, Ратна) formulas to form their own
category**, separate from ordinary фитосборы. They are a distinct traditional
class — consecrated pills, a special intake regimen, diet and cross-drug
restrictions — and conflating them with regular powders misleads the reader.

Combinations currently have **no category system**. ADR 005 deliberately deferred
one ("YAGNI"; dosha/organ grouping rode in `tags`). Herbs, by contrast, already
have a generic category model: `content/categories/*.md` parsed into the **generic
`Category` type** (`id`, `nameRu`, `body` — nothing herb-specific), referenced by
`herb.category`, counted in `categories.json` as `herbCount`.

This is a small but real model change to a stable join surface (category ids), so
it gets an ADR.

## Decision

**Generalize the existing category model to combinations** (the recommended
option). The `Category` type is already generic, so this reuses it rather than
adding a parallel mechanism.

- **`src/content/types.ts`** — `Combination` gains an optional
  `category?: string` (kebab id; when set must resolve to a `Category`), mirroring
  `herb.category`. (Also adds `nature?: string` for #1 — orthogonal, same change
  set.)
- **`src/content/loader.ts`** — parse `category` (and `nature`) on combinations.
- **`src/content/validate.ts`** — a combination's `category`, when present, must
  resolve to a real `Category` (same rule as herbs; dangling ref fails boot).
- **`src/content/index-builders.ts`** — `CombinationIndexEntry` gains optional
  `category`/`nature`; `CategoryIndexEntry` gains **`combinationCount`** alongside
  `herbCount`, so a category reports membership across both content kinds.
- **Content** — new `content/categories/rinchen-pills.md`
  (`id: rinchen-pills`, `nameRu: Драгоценные пилюли (Ринчены)`). The **8** strict
  rinchens surviving the Plan 004 #2 prune carry `category: rinchen-pills`.
  Membership is the **strict marker only** (драгоценная пилюля / Ринчен / Ратна);
  the фитосбор/порошок "Норбу" formulas are deliberately excluded.

`category` is optional and single-valued: most combinations stay uncategorized;
cross-cutting facets (dosha, organ) remain in `tags`.

## Consequences

- A category now spans both content kinds; `categories.json` reports `herbCount`
  **and** `combinationCount`. A herb-only category simply has `combinationCount: 0`
  (and vice versa).
- The rinchen class is queryable and badge-able (the review render surfaces it in
  Plan 004 Phase 5); a future combinations-browse command can group by it without
  further model work.
- Validation fails boot on a dangling combination `category` (as for herbs).
- This **amends ADR 005's** "no `category` field for combinations" decision; the
  rest of ADR 005 (and ADR 006's verbose-field relaxations) stands.

## Alternatives considered

- **Lightweight `kind: rinchen` discriminator** — rejected: a one-off field that
  doesn't generalize; a second combination class later would need replacing it,
  and it carries no `nameRu`/count, unlike a real category.
- **A plain `rinchen` tag** — rejected: `tags` are uncounted, unnamed free strings;
  the doctor asked for a first-class *category*, and reusing the generic `Category`
  costs barely more than a tag while staying queryable and consistent with herbs.
- **A parallel combination-only category source/type** — rejected: the `Category`
  type is already generic; a second mechanism would duplicate it for no gain.

## References

- Plan 004 (`docs/plans/004-formula-doctor-review-remediation.md`) #4, #1
- ADR 005 (combinations content type — amended here), ADR 006 (verbose source data)
