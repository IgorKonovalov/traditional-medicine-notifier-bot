# Plan 001 — Tibetan formula content sweep (manla.ru + bimala.ru)

**Status:** Approved
**Created:** 2026-06-23
**Completed:** —
**Bump on close:** minor

## Context

The corpus today holds only **single-herb** reference cards (`content/herbs/…`,
ADR 002). The three target sources are catalogs of Tibetan **compound formulas** —
multi-ingredient remedies such as Agar-8, Garuda-5, Aru-7, Gurgum-13:

- `https://manla.ru/herbs/` — ~50+ formulas, alphabetical, each with a detail
  monograph (composition in Latin, thermal property, indications, timing).
- `https://bimala.ru/sostav` — product catalog, ~169 products / 12 pages, per-item
  detail pages (composition, form, indications, reviews, price).
- `https://bimala.ru/katalog-tibetsij-sostavov` — same shop, grouped by
  Wind/Bile/Phlegm and organ system; names + structure, details on item pages.

We want this data captured **locally** and merged across sources into the richest
**descriptive** record per formula. Two hard constraints shape the whole effort:

1. **New content type.** A formula is not a `Herb` — it has a *composition* (member
   ingredients). The current `types.ts` / loader / index has no such shape. This is
   a non-obvious, hard-to-reverse modeling choice → **ADR 005** (Phase 1).
2. **Medical-disclaimer invariant (CLAUDE.md).** All three sources are commercial
   and prescriptive (indications, dosing, "treats X", prices). Per the project
   invariant, our records must be **descriptive only** — "traditionally associated
   with…", member ingredients, tradition/provenance — with **all dosing, treatment
   claims, prices, and shop framing dropped**. "Most complete/verbose" here means
   the richest *descriptive* explanation, never a usage instruction.

Decisions locked with the user (2026-06-23): full deduped union (~80–170 formulas);
deep-crawl detail pages; descriptive-themes-only framing; new `combinations` type.

Related: ADR 002 (content in markdown), ADR 003 (portability), content-curator &
dev skills.

## Goals / Non-goals

- **Goals:**
  - A new `combinations` content type (schema + loader + validation + committed
    index + `content:index` integration + CI drift guard), recorded in ADR 005.
  - A locally captured, deduped, source-attributed dataset of every distinct
    Tibetan formula across the three sources.
  - One markdown record per formula under `content/combinations/`, Russian,
    descriptive, ending in the standard disclaimer; member ingredients cross-linked
    to existing `Herb` records where one exists.
  - A repeatable, documented scrape→normalize→merge→author pipeline so the corpus
    can be re-swept or extended later.

- **Non-goals:**
  - No prices, dosing, administration timing, or "treats/cures" claims in the
    corpus (invariant).
  - No purchasing, availability, or e-commerce integration.
  - No new bot commands/UX in this plan (browsing combinations is a **follow-up**;
    see Open questions). This plan delivers the model + data only.
  - No authoring of new single-herb pages beyond stubs needed as cross-link targets
    (tracked, not bulk-authored, here).
  - No automated/live re-scraping at runtime — content stays build-time markdown.

## Phases

### Phase 1 — Content model & infrastructure (`combinations` type)
*Owner: architect (ADR) → dev (code). No content yet.*

- **Deliverables:**
  - `docs/adr/005-combinations-content-type.md` — decision: add a `Combination`
    type as a peer of `Herb`; member ingredients are descriptive strings with an
    optional `members` cross-ref to herb ids (validated like `herb.category`);
    indications are captured as descriptive `themes`, never prescriptive; every
    record carries `sources` provenance URLs.
  - `src/content/types.ts` — `Combination` interface + add to `LoadedContent`.
    Proposed shape:
    `id`, `tradition` (reuse `Tradition`; all 'tibetan' for now),
    `nameRu`, `nameOriginal?`, `aliases` (cross-source spellings),
    `composition` (descriptive ingredient list, required),
    `members?` (herb ids that resolve to `Herb`),
    `themes` (descriptive "traditionally associated with…", replaces indications),
    `cautions`, `category?`, `sources` (provenance URLs), `tags`, `body`.
  - `src/content/loader.ts` — `parseCombination` + walk `content/combinations/`.
  - `src/content/validate.ts` — unique combination ids; every `members[]` id and
    optional `category` resolves; **compliance assertions** (see Acceptance).
  - `src/content/index-builders.ts` — `CombinationIndexEntry` +
    `combinations` array + count; `content/.index/combinations.json`.
  - Wire `scripts/build-content-index.ts` + `content:index` / `content:index:check`
    to the new file; extend `CategoryIndexEntry.herbCount` is untouched.
  - Tests: loader parse, validation failure cases, index build.
- **Acceptance:** `npm run typecheck && npm run lint && npm test && npm run build`
  pass; `npm run content:index` produces `combinations.json` (empty array OK);
  `content:index:check` is green. Validator rejects a fixture with a dangling
  `members` id and a fixture whose `body` is missing the disclaimer.

### Phase 2 — Source reconnaissance & formula manifest
*Owner: architect/dev research. Output is working data, not corpus.*

- **Deliverables:**
  - A scrape of the three **catalog** pages (all bimala.ru pagination) into a
    working manifest (scratchpad JSON): every formula with its source URL(s),
    raw display name(s), and detail-page link.
  - A first-pass **dedupe map** keyed by canonical formula identity, recording the
    cross-source name variants (e.g. `Agar-8` = `Агар 8` = `Орлиное дерево 8`;
    `Goyu 28` = `Goju 28` = `Бетель 28`). This is the spine of the merge.
- **Acceptance:** manifest enumerates the full union with a count; each entry has
  ≥1 detail URL; the dedupe map has no obvious duplicates left unmerged on a manual
  spot-check of the Agar / Aru / Garuda / Gurgum families.

### Phase 3 — Deep crawl & structured normalization
*Owner: dev/research, batched fan-out (see Risks).*

- **Deliverables:**
  - For each manifest entry, fetch every source detail page and extract into a
    structured raw record: `composition` (ingredient list, original + Latin where
    given), `nameOriginal`, source `themes`/indications (captured raw for now),
    `cautions`, `sources[]`. Stored as intermediate JSON (scratchpad), one object
    per canonical formula merging all its sources.
  - A normalization pass: ingredient names cleaned/transliterated to Russian;
    member ingredients matched to existing `Herb` ids where one exists (e.g.
    `tib-haritaki` for Terminalia chebula / A-ru-ra), unmatched ones listed as
    descriptive strings + flagged as candidate future herb stubs.
- **Acceptance:** every canonical formula has a non-empty `composition`; conflicting
  compositions across sources are recorded side-by-side with provenance, not
  silently overwritten; a coverage log lists any formula whose detail page was
  unreachable (no silent drops).

### Phase 4 — Compliance transform (indications → descriptive themes)
*Owner: content-curator + architect compliance gate.*

- **Deliverables:**
  - A documented mapping rule turning each source indication into a descriptive
    theme or dropping it: "лечит гипертонию" → "традиционно связывают с поддержкой
    сердечно-сосудистой системы"; remove dosing/timing/price/"лечит/вылечивает".
  - Applied across all normalized records, producing the final `themes`, `cautions`,
    `nameRu`/`aliases`, `tags`, and a drafted Russian `body` per formula.
- **Acceptance:** an architect compliance review of a random 10-formula sample finds
  zero prescriptive/dosing/price/diagnosis statements; framing is uniformly "вы",
  descriptive, tradition-attributed.

### Phase 5 — Authoring & corpus integration (batched)
*Owner: content-curator. Deliver in batches of ~15–20 to keep review tractable.*

- **Deliverables:**
  - One `content/combinations/<id>.md` per formula (frontmatter per Phase-1 schema +
    Russian descriptive body ending in the standard disclaimer), authored in batches.
  - Optional `combination` category/categories if needed for grouping (decide in
    Phase 1; otherwise reuse none).
  - Herb-stub backlog: a tracked list of member ingredients that lack a `Herb`
    record, for a later content-curator pass (not authored here).
  - `npm run content:index` regenerated and committed each batch.
- **Acceptance:** loader boots clean with all formulas; `content:index:check` green;
  per-batch architect review confirms invariant compliance and cross-links resolve.

### Phase 6 — Validation, QA & close
*Owner: architect.*

- **Deliverables:** full gate run; `combinations.json` count matches the manifest
  union (minus any logged unreachable entries); coverage report of formulas captured
  vs. dropped with reasons; spot-check of 10 records against their source detail
  pages for factual fidelity of composition.
- **Acceptance:** all quality gates pass; architecture docs + ADR 005 refreshed in
  the close commit; plan moved to `done/`, `package.json` minor bump + `CHANGELOG`.

## Risks / Open questions

- **Crawl volume.** Full union with deep crawl is ~150–300 page fetches. Mitigate
  with batched fan-out (parallel fetch agents over the manifest) and the 15-min
  WebFetch cache; Phase 3 must log unreachable pages rather than silently drop.
- **Cross-source naming drift** is the central data risk — the same formula appears
  as `Agar-8` / `Агар 8` / `Орлиное дерево 8` / `Eagle Wood 8`. Phase 2's dedupe map
  is the single source of truth for canonical ids; mis-merges corrupt records.
- **Composition fidelity / transliteration.** Ingredient lists are in mixed
  Latin/Tibetan/Russian. Where sources disagree, record both with provenance
  (Phase 3) rather than guessing.
- **Copyright.** We synthesize *descriptive paraphrase* + factual ingredient lists,
  not verbatim copy; `sources[]` attributes provenance. No source body text is
  reproduced wholesale.
- **Invariant pressure.** The sources are aggressively prescriptive; the Phase-4
  transform + Phase-5 per-batch review are the guardrails. If any stakeholder wants
  source indications kept verbatim, that requires an explicit override and an ADR
  change — flag, don't silently comply.
- **Open — canonical id scheme:** `tib-formula-agar-8` vs `tib-agar-8`? (Recommend a
  `tib-formula-` prefix to keep formulas visually distinct from herb ids; decide in
  Phase 1.)
- **Open — categories:** do formulas need their own category facet (for future
  subscriptions/browse), or is `tags` + Wind/Bile/Phlegm enough? Decide in Phase 1.
- **Open — bot UX (out of scope here):** browsing/searching combinations and linking
  herb↔formula needs a UX + dev plan; deferred to a follow-up.

## Verification

- `npm run typecheck && npm run lint && npm test && npm run build` — green.
- `npm run content:index && npm run content:index:check` — `combinations.json`
  regenerates with no drift; its count equals the manifest union minus logged drops.
- Boot the loader: all `content/combinations/*.md` parse; every `members` id and
  `category` resolves; no record missing the disclaimer.
- Manual: pick 10 formulas, diff their `composition` against the source detail pages;
  grep the corpus for banned tokens (prices `₽`, «лечит», «доза», «принимать по»).

## Progress

- [x] Phase 1 — Content model & infrastructure (ae58179)
- [ ] Phase 2 — Source reconnaissance & manifest
- [ ] Phase 3 — Deep crawl & normalization
- [ ] Phase 4 — Compliance transform
- [ ] Phase 5 — Authoring & integration
- [ ] Phase 6 — Validation & close
