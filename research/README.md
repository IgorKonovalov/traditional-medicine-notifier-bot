# research/ — source provenance (not shipped)

This directory holds **raw research artifacts**, not runtime content. Nothing here
is loaded by the bot — the content loader walks only `content/`.

## `raw-crawl.json`

Raw deep-crawl output from Plan 001 (Tibetan formula sweep), captured 2026-06-23
from:

- `https://manla.ru/herbs/` (single page, 53 formulas as anchors)
- `https://bimala.ru/sostav` (169 products, 12 pages) + `…/katalog-tibetsij-sostavov`

Structure: `{ coverage, bimala: [...], manla: [...] }`. Each record carries the
formula's `nameRu`, `nameOriginal`, `composition`, `sourceIndications`,
`cautions`, and source `url`.

**⚠️ Contains original prescriptive source text** — indications, dosing hints,
and treatment claims as published by the (commercial) source sites. This is kept
for provenance and re-extraction. Whether/how any of it reaches the shipped corpus
is governed by the project's medical-content policy (see `CLAUDE.md` and the
combinations ADR).

## `raw-crawl-verbose.json`

Plan 002's "verbose re-crawl". **Superseded for fidelity** — Plan 004's diagnosis
proved this dataset's `sourceText` is an LLM-condensed paraphrase, not verbatim
page text (it silently dropped sentences and tail indications; see Plan 004
"Phase 2 diagnosis"). Kept for provenance; **not** authoritative.

## `raw-crawl-verbose-v2.json`

Plan 004 Phase 2's **faithful re-capture** of the 150 surviving combinations
(2026-06-26). Each record is a strict-verbatim capture from the **authoritative**
source — `manla.ru/herbs/` for the 53 manla formulas (manla is canonical), each
formula's `bimala.ru` detail page for the 97 bimala-only ones — produced by a
multi-agent Workflow (one verbatim-fetch agent per formula). Carries full
`sourceText` plus copied-substring `nature` / `indications` / `traditional_use` /
`dosing_notes` / `cautions`, and per-record `notes`. Captured behind the agar-35
recovery gate (must contain the previously-dropped action sentence + tail
indication). This is the source of truth for the content-restoration pass; verbose
and non-sanitised — stays behind the ADR 006 production gate.
