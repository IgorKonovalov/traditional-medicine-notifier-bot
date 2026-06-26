# Plan 004 — Formula corpus: doctor-review remediation & fidelity re-audit

**Status:** Draft
**Created:** 2026-06-26
**Bump on close:** minor (user-facing content + new fields)

## Context

A qualified practitioner reviewed the combination corpus via
`research/_private/formula-review.html` and surfaced **9 findings**, captured in
full in `research/_private/review-changes.md` (the authoritative per-finding
spec; this plan references it rather than duplicating every detail).

The headline finding (**#9**) is a **source-fidelity defect**: the original
extraction *paraphrased and condensed* the sources, dropping whole sentences and
indications. Investigation proved this is **systemic and originates in Plan
002's crawl/parse layer, not authoring**:

- For `tib-formula-agar-35`, the captured `research/raw-crawl-verbose.json`
  `sourceText` (1281 chars) is itself condensed — it ends Показания at
  "…сердцебиение." and omits a full traditional-use sentence
  (*"Обладает общеукрепляющим, тонизирующим действием, устраняет проблемы
  кровообращения, помогает при синдроме хронической усталости…"*) plus ~half the
  indications present on the live manla.ru page (*"борьба Жара и Холода",
  "Развитый Жар в сердце", "лёгочные проблемы (… астма, удушье)", "сухость во
  рту", "предотвращает психосоматические проблемы", "головную боль от Ветра"*).

So Plan 002's "full verbatim re-crawl (manla 53/53)" was **not faithful**. The
raw JSON cannot be trusted as source of truth; **manla.ru live is authoritative**
(it is the source the doctor cross-checks against).

This plan remediates all 9 findings and **regenerates the review artifact so the
doctor can re-audit** (the agreed loop: fix → re-audit).

**Related:** corrects the fidelity claim of **Plan 002** (done); follows the
structured-field pattern of **Plan 003** (#1); governed by **ADR 006** (verbose
data stays behind the owner/production gate); **ADR 005** (combinations type —
amended by #4's category extension); **ADR 002** (renderer-agnostic content).

## Goals / Non-goals

- **Goals:**
  - Restore source fidelity corpus-wide against **manla.ru** (authoritative),
    after diagnosing the Plan 002 crawl truncation (#9).
  - Add a structured **«Природа»** (`nature`) field to combinations (#1).
  - Introduce a **rinchen (драгоценные пилюли) category** — a first
    combination-level classification (#4); record an ADR for it.
  - Content hygiene: prune the 11 incomplete formulas (#2); strip caution
    boilerplate keeping specifics (#3); ingredients Russian-first, Latin in
    parens (#6); normalize list capitalization (#8); rename «Шесть благих» (#7).
  - Reorder review-card fields: Traditional use → Показания → … (#5).
  - **Commit a reproducible review-HTML generator** so each re-audit round
    regenerates deterministically (currently the generator is uncommitted —
    blocking the fix→re-audit loop).
  - Regenerate `content/.index/*` and `formula-review.html` for the doctor's
    next pass.

- **Non-goals:**
  - Shipping verbose content to the **production** bot — ADR 006 gate stays shut
    until owner/doctor sign-off (`docs/medical-review.md`).
  - A combinations browsing command / bot UX — still a separate follow-up.
  - Дакнанг line, kits, pill-grinder — remain excluded (Plan 001/002).
  - Telegram message splitting — separate effort.
  - Re-auditing the **Chinese (TCM)** corpus or **herbs** — Tibetan combinations
    only, scope of this review.

## Phases

Phases follow the **dependency order** in `review-changes.md`, not finding
number. Rationale: #9 rewrites the very fields #3/#6/#8 normalize, so
normalization must run on the *restored* text.

### Phase 1 — Prune corpus & establish reproducible review tooling
*Owner: dev.*
- **Deliverables:**
  - **#2** Delete the 11 `incomplete-composition` formulas from
    `content/combinations/` (list in `review-changes.md` #2). Drop any
    `members`/index references; keep the 6 `composition-non-itemized` ones.
  - **Commit the review-HTML generator** as a repo script under research tooling
    (e.g. `scripts/build-formula-review.ts`), reconstructed from the current
    `formula-review.html` structure, so re-audits are reproducible. Document its
    invocation.
  - Regenerate `content/.index/*`.
- **Acceptance:** corpus 161 → 150; `npm run content:index:check` green;
  running the committed generator reproduces `formula-review.html`.

### Phase 2 — Faithful manla re-crawl & fidelity restoration (#9) ⭐
*Owner: architect (diagnosis) → dev/research (opt-in multi-agent run).*
- **Deliverables:**
  - **Diagnose** why Plan 002's crawl truncated (DOM section boundary, delimiter,
    or extractor cut-off). Record the root cause; the fix must demonstrably
    capture agar-35's missing sentence + full indications.
  - **Re-crawl manla.ru live**, full-section, for each of the 150 surviving
    formulas with a faithful parser; bimala.ru as secondary cross-reference.
    Persist to a new `research/raw-crawl-verbose-v2.json` (do not overwrite v1).
  - **Reconcile**: for each record, diff captured-v2 vs current frontmatter and
    **restore** omitted `traditional_use` sentences, `indications`,
    `cautions` specifics, and `свойство`/nature into the structured fields + body.
  - Run as an **opt-in multi-agent Workflow** (per-formula fetch → diff →
    reconcile). **Do not auto-run** — requires explicit user go-ahead.
- **Acceptance:** per-formula coverage log; `agar-35` and a doctor-chosen sample
  show the restored sentences/indications; spot-check fidelity vs live pages;
  v2 raw dataset committed under `research/`.

### Phase 3 — Structured model extensions
*Owner: architect (ADR + types) → dev.*
- **Deliverables:**
  - **#1 «Природа»**: add optional `nature?: string` to the `Combination` type
    (`src/content/types.ts`), parse in `loader.ts`, project into
    `combinations.json` (`index-builders.ts`) — mirroring Plan 003's
    spread-when-present pattern. Lift the value out of the body `## Свойство`
    section and the `traditional_use` "Природа/свойство:" bullet.
  - **#4 rinchen category** — **DESIGN DECISION + ADR**: combinations currently
    have **no category system** (`content/categories/` + `categories.json` are
    herb-only, keyed by `herbCount`). Choose & record (ADR 007) one of:
    (a) generalize categories to combinations (`category` field + combination
    membership + `combinationCount`), or (b) a lightweight `kind: rinchen`
    discriminator. Recommendation: **(a)** — it is the queryable, extensible
    option and aligns with the existing herb-category model. Assign the 11
    strict rinchens (`review-changes.md` #4; 8 survive after #2);
    `id: rinchen-pills`, `nameRu: Драгоценные пилюли (Ринчены)`.
- **Acceptance:** typecheck/lint/test green; `nature` and rinchen membership
  appear in the regenerated index; ADR 007 committed.

### Phase 4 — Content normalization passes (on the restored text)
*Owner: content-curator / dev.*
Run **after** Phase 2 so we normalize restored, not stale, text.
- **Deliverables:**
  - **#7** Rename `name_ru` → «Шесть благих тибетский фитосбор (порошок)» for
    `tib-formula-6-horoshih` (id unchanged).
  - **#6** Ingredients → `Russian (Latin)`: flip the 488 `Latin (Russian)` lines;
    translate the 52 Latin-only (flag the untranslatable handful for the doctor);
    leave the 1126 Russian-only as-is.
  - **#3** Cautions: strip boilerplate (disclaimer + «индивидуальная
    непереносимость» + site filler), **keep** formula-specific contraindications
    (pregnancy, Жар/Холод, gastritis, food/duration/cross-drug limits). Per-line
    filter (some lines mix both).
  - **#8** Capitalization: cap-first on short-label lists (composition,
    indications) + sentence-case on sentence fields (traditional_use, dosing,
    cautions), preserving the TM-term protected list (Ветер, Жар, Кровь, Слизь,
    Желчь, Чху-Сэр, Хлад, …).
- **Acceptance:** `content:index:check` green; no boilerplate cautions remain;
  ingredient/indication lists are cap-first Russian-leading; spot-checks pass.

### Phase 5 — Review render & re-audit handoff
*Owner: dev.*
- **Deliverables:**
  - **#5** Reorder generator card fields: Traditional use → Показания → Состав →
    … . Surface the new **«Природа»** field and the **rinchen category** badge on
    the card.
  - Regenerate `content/.index/*` and `formula-review.html`.
- **Acceptance:** regenerated HTML reflects all of #1–#8; opens cleanly; handed
  to the owner for the doctor's next re-audit round.

### Phase 6 — Validation & close
*Owner: architect.*
- Run gates; refresh `CLAUDE.md` / `docs/architecture/` / ADR 005 successor note
  + ADR 007; update `docs/medical-review.md` (fidelity-restored, still gated);
  semver **minor** bump; move plan to `done/`.

## Phase 2 diagnosis — crawl-fidelity root cause (2026-06-26)

**Verdict:** the Plan 002 "full verbatim re-crawl" was **not verbatim**.
Extraction was delegated to **LLM agents** (multi-agent fan-out; no committed
deterministic parser exists), and the model **condensed, relabeled, and
reordered** each formula section — dropping trailing sentences and tail
indications. The raw JSON `sourceText` is a **model-generated paraphrase**, not
source bytes; **manla.ru live is authoritative**.

### Evidence

1. **No deterministic parser to re-run.** Both crawls ran as ad-hoc Workflow
   fan-outs — `raw-crawl.json` carries `agentCount: 161` and
   `summary: "Deep-crawl … into structured raw records"`; Plan 002 Phase 2 is
   labelled "batched workflow fan-out". The "parser" *was* an LLM.
2. **`sourceText` is a generated field, not page text.**
   - 4/155 bimala records are 100% synthetic templates
     (`Русское название: … Состав: … Основной текст: …`) — field labels no source
     page emits.
   - manla output is **non-uniform under one pipeline**: only 3/53 reorder
     «Свойство» ahead of «Показания»; the native manla field **«Сущность»**
     (gurgum-13, aru-10) is silently relabeled to «Свойство» in agar-35; some
     records preserve page line-breaks, others (agar-35) are reflowed to a single
     paragraph. A deterministic DOM slice produces uniform structure — this
     variance is an LLM fingerprint.
   - `sourceText` length spans **391–2322 chars** (median 1049) with no fixed cap
     → not a byte/length truncation.
3. **agar-35 specifically.** Captured manla `sourceText` (1281 ch) is reordered to
   `… Свойство: нейтральная. <action sentence> Показания: …гипертонический криз,
   сердцебиение. Время приёма…` — it ends Показания at "сердцебиение." and keeps
   only the *first* action sentence. Live manla additionally carries a second
   action sentence ("Обладает общеукрепляющим, тонизирующим действием…") and a
   longer Показания tail («лёгочные проблемы (… астма, удушье)», «головную боль от
   Ветра», …). Both omissions are contiguous tail content — a summarization drop,
   not a DOM-boundary cut. (Plan 001 `raw-crawl.json` captured even less: only
   composition + one sentence + cautions, no Показания list at all.)

### Why manla is the hard case

`manla.ru/herbs/` is a **single anchored page** (53 formulas; `#agar-35`). There
is no per-formula DOM container — a "section" is delimited only by an anchor, so
its tail is trivially dropped by an LLM asked to "capture the description".
bimala's per-formula detail pages fared better but are still LLM-extracted (hence
the 4 templated records).

### Fix — faithful re-crawl/parse (for the gated Workflow phase)

Remove the "LLM summarizes prose → `sourceText`" step. Capture deterministically;
use an LLM only to *split already-verbatim text* at the page's own labels:

1. **manla** — fetch `https://manla.ru/herbs/` once; deterministically slice each
   formula's section between consecutive anchors (`#agar-35` → next anchor);
   capture **all** nodes verbatim into `sourceText` (every paragraph, full
   Показания). No paraphrase, relabel, or reorder; preserve the native «Сущность».
2. **bimala** (secondary cross-ref) — fetch each detail page; capture the
   description container's full text verbatim.
3. **Structuring (second pass)** — derive `indications` / `traditional_use` /
   `dosing_notes` / `cautions` / `nature` by splitting the verbatim `sourceText`
   on the page's own labels («Сущность:», «Показания:», «Время приёма:»,
   «Противопоказания:»). Any LLM here is constrained to "copy clauses exactly
   between these labels; never paraphrase, drop, reorder, or relabel".
4. **Recovery gate (acceptance proof)** — assert re-captured agar-35 `sourceText`
   contains both the marker `"Обладает общеукрепляющим"` and the tail indication
   `"головную боль от Ветра"`. A doctor-chosen sample (5–10 formulas) is
   spot-checked verbatim against live pages before the batch is accepted.

This phase still runs as the **opt-in multi-agent Workflow** (per-formula fetch →
verbatim capture → label-split → diff vs current frontmatter → reconcile) and
**must not auto-run**.

## Risks / Open questions

- **Crawl-fidelity root cause is a prerequisite (Phase 2).** Do not trust a
  re-crawl until the Plan 002 truncation is understood and the new parser
  demonstrably recovers agar-35's missing content. `raw-crawl-verbose.json` (v1)
  is **not** authoritative.
- **Extractor embellishment risk.** A small-model HTML→text extractor can itself
  omit *or invent*. The re-crawl needs a deterministic parser plus a doctor
  spot-check of a sample — not blind acceptance.
- **#4 needs an ADR (combination categorization).** Small but real model change;
  amends ADR 005. Captured as Phase 3 deliverable (ADR 007).
- **#6 untranslatable ingredients.** A few Latin-only names lack a clean RU
  species name (`Solms-Laubachia sp.`, `Trona`, `Bos taurus domesticus`) — doctor
  decides; leave Latin-only if no faithful RU exists.
- **Production gate unchanged (ADR 006).** Restored verbose prose stays
  non-production until owner/doctor sign-off.
- **Expect a follow-up round.** This plan closes one fix→re-audit cycle; the
  doctor's next pass may surface more.

## Verification

- `npm run typecheck && npm run lint && npm test && npm run build` — green.
- `npm run content:index && npm run content:index:check` — no drift.
- Phase 2 coverage log + agar-35/sample fidelity spot-check vs live manla.ru.
- Committed generator reproduces `formula-review.html`; regenerated HTML shows
  «Природа», rinchen category, reordered fields, Russian-first ingredients,
  cleaned cautions, normalized capitalization.

## Progress

- [x] Phase 1 — Prune corpus & reproducible review tooling (#2)
  — `b0e4430` (gitignore research sources), `4d17c1d` (prune 11 → corpus 150),
  `609f23c` (committed `scripts/build-formula-review.ts` + `npm run content:review`)
- [x] Phase 2 — Faithful manla re-crawl & fidelity restoration (#9)
  — diagnosis (see "Phase 2 diagnosis" above); capture `46c7093` (Workflow
  re-captured 150/150, 0 failures, agar-35 gate passed,
  `research/raw-crawl-verbose-v2.json`); reconcile `ece7f35` (manla-canonical:
  all 150 rewritten from the authoritative capture — verbose fields restored,
  body = verbatim `## Источник: <host>`). Owner decision: for the 47
  dual-source formulas manla is canonical, bimala embellishments dropped.
- [x] Phase 3 — Structured model extensions (#1 nature, #4 rinchen category + ADR 007)
  — `177b48c`: `nature` field (66 populated) + generic combination `category`
  (ADR 007, `rinchen-pills` × 8); index gains `combinationCount`; +4 tests.
- [ ] Phase 4 — Content normalization (#7, #6, #3, #8)
- [ ] Phase 5 — Review render & re-audit handoff (#5 + surface #1/#4)
- [ ] Phase 6 — Validation & close
