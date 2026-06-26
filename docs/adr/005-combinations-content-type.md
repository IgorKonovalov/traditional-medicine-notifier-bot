# ADR 005 — `combinations` content type (compound formulas)

**Date:** 2026-06-23
**Status:** Accepted (amended by ADR 006 — verbose source fields; ADR 007 —
combination categories add the `category` facet this ADR deferred)

## Context

The corpus (ADR 002) models only single-herb reference cards (`Herb`). Plan 001
sweeps three Tibetan sources whose entries are **compound formulas** — multi-herb
remedies (Agar-8, Garuda-5, Gurgum-13) defined primarily by their *composition*.
A formula is not a herb: it has member ingredients, cross-source name variants, and
provenance. Forcing it into `Herb` (a "composition" string field on a herb) would
blur the herb-vs-formula distinction at every read site and corrupt the index's
herb counts. This is a hard-to-reverse modeling choice — ids are stable join keys —
so it gets an ADR.

The sources are commercial and prescriptive (indications, dosing, prices). The
medical-disclaimer invariant (CLAUDE.md) requires our records stay **descriptive
only**, so the type must carry *descriptive themes*, never indications/dosing.

## Decision

Add a **`Combination`** type as a first-class peer of `Herb`, loaded from
`content/combinations/**.md`. It governs these files:

- **`src/content/types.ts`** — new interface + `combinations` bucket on
  `LoadedContent`:
  - `id` — stable, prefixed **`tib-formula-<slug>`** (e.g. `tib-formula-agar-8`).
  - `tradition` — reuse `Tradition` (all `'tibetan'` for now).
  - `nameRu`, `nameOriginal?` — display + transliterated Tibetan.
  - `aliases: string[]` — cross-source spellings (`Агар 8`, `Орлиное дерево 8`).
  - `composition: string[]` — **required, non-empty** descriptive ingredient list.
  - `members?: string[]` — herb ids that resolve to a real `Herb` (validated like
    `herb.category`); ingredients without a herb page stay as `composition` strings.
  - `themes: string[]` — descriptive "traditionally associated with…" (the
    compliant replacement for source indications; **never** prescriptive).
  - `cautions: string[]`, `tags: string[]`, `sources: string[]` (provenance URLs),
    `body`.
  - **No `category` field** — dosha (Wind/Bile/Phlegm) and organ-system grouping
    ride in `tags`. Adding a category facet later is additive.
- **`src/content/loader.ts`** — `parseCombination` + walk `content/combinations/`.
- **`src/content/validate.ts`** — unique combination ids; every `members[]` id
  resolves to a herb; **`composition` non-empty**.
- **`src/content/index-builders.ts`** — `CombinationIndexEntry`
  (`id, nameRu, nameOriginal?, tags, memberCount, sourceCount`), a `combinations`
  array, and `counts.combinations`.
- **`scripts/build-content-index.ts`** — add `'combinations.json'` to the `files`
  map so `content:index` writes it and `content:index:check` guards drift.

Member ingredients are descriptive strings; the optional `members` cross-ref is the
**only** structural link between a formula and the herb corpus, kept one-directional
(formula → herb) to preserve content-layer independence (ADR 003).

## Consequences

- Browsing/searching formulas and a herb↔formula UX become possible but are **not**
  delivered here — a follow-up plan owns bot surfaces.
- Every new proactive/derived surface over formulas must honor the descriptive-only
  invariant; `themes`, not indications, is the field that reaches readers.
- The committed index gains `combinations.json`; CI drift-checks it like the others.
- Validation now fails boot on a dangling `members` id or an empty `composition`.

## Alternatives considered

- **Extend `Herb` with an optional `composition`** — rejected: pollutes the herb
  shape, breaks herb counts, and conflates two different content kinds at read time.
- **Bidirectional herb↔formula links** — rejected: a herb knowing its formulas
  couples the herb record to corpus it shouldn't own; keep the ref formula→herb.
- **A `category` facet for formulas now** — deferred (YAGNI); tags carry grouping
  until a subscription/browse feature needs more.

## References

- Plan 001 (`docs/plans/001-tibetan-formula-sweep.md`)
- ADR 002 (content in markdown), ADR 003 (portability discipline)
