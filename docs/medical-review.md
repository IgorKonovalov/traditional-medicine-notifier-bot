# Medical review gate (ADR 006)

**Status: PENDING — owner-managed.** The verbose Tibetan-formula corpus under
`content/combinations/` is a **staging artifact**. Per ADR 006, **none of it may
reach the production bot** until a qualified Tibetan-medicine practitioner has
reviewed it and the owner has signed off. The owner will report when the review is
complete and how any changes should be applied.

## Review inputs

- **Corpus:** `content/combinations/*.md` (161 formulas) — structured fields
  (`indications`, `traditional_use`, `dosing_notes`, `composition`, `cautions`) plus
  a full verbatim body merging `bimala.ru` and `manla.ru` source text.
- **Raw provenance:** `research/raw-crawl-verbose.json` — the unmerged crawl output
  (full verbatim text per source).

## What the corpus deliberately contains (non-sanitised)

The records carry the **original source claims verbatim** — indications, treatment
language, and dosing/administration. This is intentional for review completeness,
not a bug. The review decides what, if anything, is reworded, pruned, or kept for
production. Transactional/commercial e-commerce noise (prices, stock, bonus points,
reviews, manufacturer) has been removed (see Cleanup pass); the unmerged
`research/raw-crawl-verbose.json` still holds it verbatim if needed.

## Cleanup pass (2026-06-26)

A data-cleanup pass ran over the corpus (163 → 161 formulas):

- **Duplicates merged (manla-priority):** `chongzhi-6` → `dzhonshi-6` and
  `sposkar-10` → `pokar-10` — confirmed identical-composition twins, folded into the
  bimala-id record (manla wins on the one scalar conflict, "Сущность/свойство"; both
  `## Источник:` sections and URLs retained). The remaining manla-only records
  (`lomang-8`, `lchumtsa-3`, `mkhalma-9`, `sugmel-13`, `blonpo-3`, `tsarbong-5`) have
  **no same-count bimala twin** — the number in a formula name is its ingredient
  count, so e.g. `sugmel-13` ≠ `sugmel-10`/`sugmel-7`. They stay standalone.
- **Grammar/spelling:** 106 conservative fixes across 58 files (Latin-binomial typos,
  Russian misspellings, spacing/encoding artifacts).
- **Commercial noise removed:** 192 transactional snippets across ~52 files (prices,
  stock/availability, bonus points, manufacturer, reviews, notify-on-arrival) stripped
  from both the `source_text` block scalar and the `## Источник:` bodies. Medicinal
  fields (dosage form, course weight, administration) and the explanatory
  "page had no description" notes were kept; composition-less records keep a non-empty
  `source_text`.
- **Case-agreement normalised:** 117 grammatical fixes across the corpus (wrong-case
  agreement from extraction, e.g. `при воспаления`→`при воспалении`, `на языка`→`на
  язык`; conjunction `так же`/`а так же`→`также`/`а также`).

Raw provenance in `research/raw-crawl-verbose.json` is unchanged, so every edit above
is auditable against the original crawl.

## Open items for the review

- **Source factual discrepancies surfaced during cleanup (NOT auto-corrected):**
  - `gurgum-8`: name says "8" but `name_original` + body read "Gurgum 7".
  - `agar-15`, `pangen-15`: Latin `Melia composita` maps to a different Russian
    component (`адатода васика` / Adhatoda vasica) than the binomial implies.
  - `srogdzin-11`: manla lists `Shorea robusta` where composition has `Bombax ceiba`.
  - `Terminalia belerica` vs accepted `Terminalia bellirica` (variant, left as-is).
  - `gurkyung`: body composition list repeats `костус` twice — possible duplicate
    component, left as-is.
- A few **ambiguous case-agreement** spots were deliberately left (e.g. `giwan-9`
  "повреждение или ушибах печени" — nominative vs prepositional unclear). Decide
  during review.
- Whether dosing/administration text is retained, reworded, or removed for production.

## Sign-off

| Date | Reviewer | Scope | Outcome |
|------|----------|-------|---------|
| —    | —        | —     | pending |

_When production-eligible content is approved, record it here and define how it is
surfaced (the bot currently has no combinations command — that is a separate
follow-up plan)._
