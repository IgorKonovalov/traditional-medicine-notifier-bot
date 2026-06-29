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

## `raw-crawl-verbose-v2-bimala-reaudit.json`

A **completeness-gated re-capture of the 97 bimala-only formulas** (2026-06-27),
prompted after a spot-check found the Phase-2 bimala captures occasionally
condensed the description (the manla captures were faithful). Each agent fetched
the detail page **twice** and took the union, self-reporting a `complete` flag +
`sentenceCount`; gated on `kodzhi-13` recovering its two dropped sentences. The
reconcile updated `traditional_use` for **12** formulas with genuine recoveries;
**6** are flagged for the doctor (1 fetch-paraphrased, 5 self-incomplete). Generic
rinchen-preamble / commercial sentences in this capture were deliberately **not**
merged into the content.

## `НАУКА_О_ЗДОРОВЬЕ_1.pdf` (gitignored) + `_private/nauka-zdorovye-text.txt`

«Наука о здоровье. Сова Ригпа» — popular-lecture book by Dr. Rinchen Tenzin
(lectures 2012–2013, compiled by T. Rastorgueva, 2nd ed. 2015; free for
non-commercial use with attribution to sowa-rigpa.ru). A Bön-tradition Sowa Rigpa
health guide: origins/diagnosis, 5 elements + 3 life-principles, daily/annual
rhythm, six tastes, constitution portraits (Wind/Fire/Earth-Water), a food-
properties catalogue, and chapters on pregnancy/children and the elderly. This is
the **source corpus for the daily-tips content** (existing tips already cite
«Сова Ригпа»).

**Extraction note:** the PDF text layer uses a broken font encoding — `pdftotext`
silently drops **all** Cyrillic. Use **PyMuPDF** (`fitz`) to recover clean UTF-8
text; that recovered text is `_private/nauka-zdorovye-text.txt` (gitignored, with
`===== PAGE n =====` markers). The PDF itself is gitignored via `research/*.pdf`.

## `zhud_shi_canon.pdf` (gitignored) + `_private/zhud-shi-text.txt` + `_private/zhud-shi-chapter-map.md`

«Чжуд-ши. Канон тибетской медицины» (М.: Наука) — the canonical Four-Tantras
treatise, **source corpus for the canonical-voice daily tips** (Plan 018). 766 pp
with a real **ABBYY OCR text layer** (unlike the Сова Ригпа PDF, Cyrillic
survives both PyMuPDF and `pdftotext`). Extracted with **PyMuPDF** (Plan 018
Phase 3) to `_private/zhud-shi-text.txt` (gitignored, `===== PAGE n =====`
markers = 1-based PDF pages). A **conservative whole-word** OCR-cleanup map was
applied (768 replacements — non-word garbles like `нало→надо`, `фуди→груди`, plus
the corpus-unambiguous пища food-family; **never** blanket char swaps, since
`д↔л`/`щ↔ш` misread both ways and `ф→г` would corrupt real ф-words). Residual
confusions are left for **per-citation hand-check** — the Plan 018 headline risk.

**Chapter→page map:** `_private/zhud-shi-chapter-map.md` recovers the printed
ОГЛАВЛЕНИЕ. **Тома I+II printed page = PDF page − 2** (verified; the offset drifts
only past the off-limits diagnosis zone). Tip-able material is **Тантра основ (I)
+ Тантра объяснений (II)** only; **Тантра наставлений (III, 92 ch)** and
**Дополнительная тантра (IV, 27 ch)** are treatment/diagnosis/dosing =
**off-limits** by the non-medical-advice invariant. Method is reproducible from
this note; the one-off extraction script was not committed (mirrors the Сова
Ригпа entry above).
