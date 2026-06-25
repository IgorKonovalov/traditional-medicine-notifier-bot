# Medical review gate (ADR 006)

**Status: PENDING — owner-managed.** The verbose Tibetan-formula corpus under
`content/combinations/` is a **staging artifact**. Per ADR 006, **none of it may
reach the production bot** until a qualified Tibetan-medicine practitioner has
reviewed it and the owner has signed off. The owner will report when the review is
complete and how any changes should be applied.

## Review inputs

- **Corpus:** `content/combinations/*.md` (163 formulas) — structured fields
  (`indications`, `traditional_use`, `dosing_notes`, `composition`, `cautions`) plus
  a full verbatim body merging `bimala.ru` and `manla.ru` source text.
- **Raw provenance:** `research/raw-crawl-verbose.json` — the unmerged crawl output
  (full verbatim text per source).

## What the corpus deliberately contains (non-sanitised)

The records carry the **original source claims verbatim** — indications, treatment
language, dosing/administration, and (in some bodies) commercial notes (price,
stock, manufacturer). This is intentional for review completeness, not a bug. The
review decides what, if anything, is reworded, pruned, or kept for production.

## Open items for the review

- Confidence-flagged cross-source merges (see Plan 002): a few manla formulas were
  kept **separate** rather than merged with a bimala namesake when identity was
  uncertain — `lomang-8`, `lchumtsa-3`, `mkhalma-9`, `sugmel-13` (+ the manla-only
  set `blonpo-3`, `sposkar-10`, `tsarbong-5`, `chongzhi-6`). Confirm or merge.
- Whether commercial noise (prices/stock) should be stripped from bodies.
- Whether dosing/administration text is retained, reworded, or removed for production.

## Sign-off

| Date | Reviewer | Scope | Outcome |
|------|----------|-------|---------|
| —    | —        | —     | pending |

_When production-eligible content is approved, record it here and define how it is
surfaced (the bot currently has no combinations command — that is a separate
follow-up plan)._
