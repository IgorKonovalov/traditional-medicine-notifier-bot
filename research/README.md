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
