# Plan 018 — Expand the daily-tip pool to ~190–200 (two-tier: production + gated indication)

**Status:** Completed
**Created:** 2026-06-29
**Approved:** 2026-06-29 (owner)
**Completed:** 2026-06-29 (v0.20.0)
**Bump on close:** minor (27 new user-facing published tips)

## Outcome (final, supersedes the two-tier plan below)

Shipped as a **published-tier-only** expansion. The two-tier design (production +
gated disease-indication tier behind a tip-staging gate) was built, then the
**gated tier was dropped entirely on the owner's decision** during review
(2026-06-29): the food-property content already lives in the structured `foods`
corpus (ADR 012), the geriatric audience is out of focus, and a smaller fully-
published pool was preferred (other sources may come later).

**Delivered:**
- **27 new published tips** (`tip-061`…`tip-087`), pool 60 → **87**: 13 Чжуд-ши
  canonical theory/food + 14 Сова Ригпа foundations/elderly-lifestyle/food-prep.
- Чжуд-ши canon **extracted + OCR-cleaned** to gitignored
  `research/_private/zhud-shi-text.txt` + chapter map (kept for future authoring;
  README provenance committed).
- `conventions.md` amended: newly-verified Чжуд-ши chapters (чч. 2/4/6/8/9/17) +
  the direct-conduct voice allowance (non-medical lifestyle only).

**Built then reverted (no user-facing trace):** the tip-staging gate
(`Tip.status`, `includeStagingTips`, `isProductionTip`, index `status`, gate
tests, review tooling) and the **39 gated tips** — all removed (commit 81adeb0).
**ADR 014 is Withdrawn** (kept as a historical record; revive via a fresh ADR if
a gated tip tier returns).

## Context

The daily-tip pool holds **60 tips** today (`tip-001..060`): 30 paraphrased from
**«Чжуд-ши»** (Тантра объяснений, precise chapter citations) and 30 from
**«Наука о здоровье. Сова Ригпа»** (Ринчен Тензин), all rewritten to the
source-faithful clinical register locked by **Plan 012**. The owner wants to
**greatly expand the pool to ~190–200** so the proactive rotation (`pickDailyTip`
→ `tips[dayIndex % length]`, pure index-order — `src/index.ts:171`,
`src/bot/commands/tips.ts:19`) runs ~6+ months without repeat.

**Source audit (this session) — both sources support the target:**

- **Сова Ригпа book** is already extracted (gitignored
  `research/_private/nauka-zdorovye-text.txt`, 6 chapters). Untapped seams:
  гл. 1 foundations, **гл. 4 food-property catalogue (the «ПРОДУКТЫ И ИХ СВОЙСТВА»
  materia dietetica, lines ~2529–2926)**, гл. 6 elderly, and deeper гл. 3. гл. 5
  (pregnancy/children) stays **excluded** (medical scope).
- **Чжуд-ши canon** (`research/zhud_shi_canon.pdf`, 766 pp) **is extractable**:
  real ABBYY OCR text layer (not scanned images), Cyrillic survives via PyMuPDF
  **and** `pdftotext` (unlike the Сова Ригпа PDF). The printed ОГЛАВЛЕНИЕ
  (pp. 757–761) gives the full chapter map; PDF page = printed page + 1. Cost is
  OCR cleanup (systematic `д→л`, `щ→ш`, `г→ф`, `ц→ии`) + per-citation verification
  — **not** extraction. Tip-able material is **Тантра основ (I)** + **Тантра
  объяснений (II)** only; **Тантра наставлений (III, 92 ch)** and **Дополнительная
  тантра (IV, 27 ch)** are treatment/diagnosis/dosing = **off-limits** by the
  non-medical-advice invariant.

**Two owner decisions (2026-06-29) shape this plan:**

1. **Gated disease-indication tips are allowed**, behind the **ADR 006 doctor/
   production gate** — descriptive, source-faithful ("в традиции при X
   применяют Y"), **never** second-person dosing. This mirrors how the formula
   verbose fields are handled (surfaced on the private pre-launch bot as a
   live-review surface, pending `docs/medical-review.md` sign-off). **This flips
   the food-property catalogue from excluded material into the engine of the
   expansion** (~70 gated food tips).
2. **Direct second-person conduct guidance is allowed** for non-medical lifestyle
   topics only (warmth, meal timing, sleep, movement) — e.g. «держите поясницу в
   тепле». This **amends the Plan 012 voice spec** (which banned second-person)
   and never extends to medical/dosing content.

**Yield, in two tiers (mapping onto the gate):**

| Tier | Seams | Realistic |
|---|---|---|
| **Production-visible** (lifestyle/conduct/theory) | 60 existing + ~18 book-lifestyle + ~18 Чжуд-ши | ~95–100 |
| **Gated staging** (disease-indication, doctor-gated) | food-property catalogue (~65–75) + geriatric (~10) | ~80–90 |
| | **Total** | **~175–200** |

~190–200 is the **ceiling, not the comfort zone**: the last ~25 tips come from
granular catalogue mining + a few canonical-voice restatements. A clean
high-quality landing is ~170–185; pushing to 200 is acceptable **for a gated
practitioner reference** but trades some polish.

**This is NOT a pure content plan** (unlike Plans 005/012). It adds a **tip-staging
gate** — a new `Tip` frontmatter flag + a content-load visibility split — so the
gated tier cannot reach production before doctor sign-off. That gate warrants an
**ADR** (parallel to ADR 013's tradition gate).

**Related:** extends **Plan 005** (60-tip pool) and **Plan 012** (voice spec —
this plan amends the second-person rule); reuses `TipSource` (**Plan 003**);
governed by **ADR 006** (staging/doctor-gate), **ADR 004** (proactive budget,
untouched), **ADR 002** (renderer-agnostic; `Источник:` built by
`formatTipSource`); new ADR for the tip-staging gate; mirrors **ADR 013**
(`src/content/visibility.ts`) and the `FORMULA_BRANCH_ENABLED` pattern.

## Goals / Non-goals

- **Goals:**
  - Grow `content/tips/` from 60 to **~190–200** well-formed Russian tips in two
    tiers: **production-visible** (~95–100) and **gated staging** (~80–90).
  - **Tip-staging gate:** a `Tip` frontmatter `status` field
    (`published` | `staging`, default `published`) + a content-load split so
    `staging` tips are **dropped from the production runtime** (the `pickDailyTip`
    pool, the 💡 leaf, search) but **kept in `content/.index/tips.json`** for
    doctor review — mirroring `includeHiddenTraditions` (ADR 013).
  - **ADR** for the tip-staging gate.
  - **Extract & OCR-clean the Чжуд-ши canon** to a gitignored research text +
    chapter→page citation map; record provenance in `research/README.md`.
  - **Author the production tier** (~36 new): Чжуд-ши theory/lifestyle + book
    lifestyle, in the Plan 012 clinical register **plus** the new direct-conduct
    allowance — every tip descriptive at the *medical* level, no dosing/diagnosis.
  - **Author the gated tier** (~80 new): food-property catalogue food-by-food +
    geriatric indications, `status: staging`, descriptive disease-indication,
    **never** second-person dosing.
  - **Doctor-review surface:** gated tips listed in a review artifact (like the
    formula review HTML) and tracked in `docs/medical-review.md` for sign-off.
  - Amend content-curator `conventions.md`: direct-conduct voice, food-catalogue
    citation convention, gated-tip convention. Regenerate the index; `content:
    index:check` green.
- **Non-goals:**
  - **No change to tip selection/rotation logic** or the proactive budget gate
    (ADR 004). Rotation stays pure index-order.
  - **No production sign-off of the gated tier** — it ships behind the gate,
    pending the owner/doctor's documented approval (separate event, like formulas).
  - No гл. 5 (pregnancy/children) material; no Тантра III/IV treatment material.
  - No new tip command, per-topic digest, tip categories, or `url` field.
  - No verbatim quoting from either source — paraphrase (honest-sourcing Rule 2).
  - No Chinese (TCM) tips (ADR 013 surface is Tibetan-only).

## Phases

### Phase 1 — Lock the gating design + tier targets (architect → owner) ✅ DONE (2026-06-29)
*No code/content yet — design only.*

**Outcome — locked in [ADR 014](../adr/014-tip-staging-gate.md):**
- Gate = `Tip.status: 'published' | 'staging'` (default `published`); single
  `loadContent` chokepoint via `includeStagingTips` opt (mirrors
  `includeHiddenTraditions`); index builder opts in; `status` projected into
  `tips.json`.
- **Pre-launch exposure (open question) — resolved: review-only.** Owner chose
  (2026-06-29) that gated tips are visible on **no** bot (private or public) — the
  loader default excludes them, so `pickDailyTip`/💡 leaf/search never serve them.
  Review happens via a generated `research/_private` HTML artifact, tracked in
  `docs/medical-review.md`. Reviewers are never pushed unvetted disease-indication
  claims; the public launch is a no-op for users.
- **Promotion is per-tip, not a blanket flip.** On documented doctor sign-off, a
  tip's `status: staging` is removed (→ published). This **supersedes the
  "one-edit production flip" phrasing** below (it described the rejected
  formula-style model).
- Tier targets confirmed: production ~95–100, gated ~80–90; land-point chosen in
  Phase 4 within 170–200.

- **Deliverables:**
  - **Gate design**, recommended: `Tip.status: 'published' | 'staging'` in
    frontmatter (default `published` when absent — the 60 existing tips need no
    edit); a content-load filter in/near `src/content/visibility.ts`
    (`isProductionTip` or extend the module) so `loadContent` drops `staging`
    tips from `content.tips.all` **unless** an `includeStagingTips` opt is passed;
    the **index builder opts in** so all tips stay indexed. Production exclusion
    enforced the same way the formula branch is: gated tips visible on the
    **private pre-launch bot** for review, dropped at public launch.
  - **Decide the pre-launch exposure of gated tips** (open question): do they join
    the daily proactive rotation + 💡 leaf for reviewers, or surface **only** in a
    review view? Recommendation: keep them **out of the proactive daily push** and
    out of the 💡 «Совет дня» leaf, exposed only via the doctor-review artifact —
    so reviewers aren't pushed unvetted medical claims, and the production flip is
    a no-op for end users. Confirm with owner.
  - **ADR** (next free number) recording the tip-staging gate, its chokepoint, and
    the one-edit production flip.
  - Confirm tier targets (production ~95–100, gated ~80–90) and the accepted
    quality/quantity trade at the 190–200 ceiling.
- **Acceptance:** gate mechanism, pre-launch exposure, and targets owner-approved;
  ADR drafted. No authoring or extraction begins until this is signed off.

### Phase 2 — Build the tip-staging gate (dev)
- **Deliverables:**
  - Extend the `Tip` type + frontmatter schema with `status` (default
    `published`); loader validates the enum.
  - Content-load visibility split (`includeStagingTips` opt, mirroring
    `includeHiddenTraditions`); production callers exclude, index builder includes.
  - Unit tests: a `staging` tip is absent from `content.tips.all` on the
    production path, present on the index path; an absent `status` defaults to
    `published`; `pickDailyTip` never serves a `staging` tip on the production path.
- **Acceptance:** `npm run typecheck && lint && test && build` green; a fixture
  `staging` tip is provably hidden from the production pool and present in the
  index.

### Phase 3 — Extract & prep the Чжуд-ши source (dev/content)
- **Deliverables:**
  - PyMuPDF extraction of all 766 pp to gitignored
    `research/_private/zhud-shi-text.txt` with `===== PAGE n =====` markers.
  - A curated OCR-cleanup substitution map (`д/л`, `щ/ш`, `г/ф`, `ц/ии`, …)
    applied; residual confusions left for per-citation hand-check.
  - Chapter→page map recovered from the ОГЛАВЛЕНИЕ (pp. 757–761), covering
    Тантра основ (I) + Тантра объяснений (II), marking III/IV off-limits.
  - Provenance paragraph appended to `research/README.md`.
- **Acceptance:** text is clean enough to read/cite; chapter map covers the
  tip-able tantras; every later Чжуд-ши citation is verifiable against a page.

### Phase 4 — Master tip outline (content-curator → architect sign-off)
- **Deliverables:** one table of **all** new candidates —
  `proposed-id | source + citation | tier (published/gated) | one-line topic |
  dedup note`. Rough targets: ~18 Чжуд-ши + ~18 book-lifestyle (published);
  ~70 food-catalogue + ~10 geriatric (gated). Dedup against the existing 60 and
  flag near-duplicate canonical restatements; verify each Чжуд-ши citation against
  the page (Phase 3 map).
- **Acceptance:** outline owner-reviewed; no topic collides with an existing tip;
  every candidate has a tier; Чжуд-ши citations page-verified; the realistic total
  is agreed (land-point chosen within 170–200).

### Phase 5 — Author the production tier (~36) (content-curator)
- **Deliverables:** new `content/tips/tip-0NN-<slug>.md` (ids continue the
  sequence) for Чжуд-ши theory/lifestyle + book lifestyle, **`status` omitted**
  (= published). Plan 012 clinical register + the **new direct-conduct allowance**
  (second-person OK for non-medical conduct); descriptive at the medical level;
  no baked-in `Источник:`; tasteful single leading emoji; ≤ ~900 chars body.
- **Acceptance:** files validate on `npm run content:index`; spot-read of ≥10
  confirms register + **zero** dosing/diagnosis-to-reader; citations page-verified.

### Phase 6 — Author the gated tier (~80) (content-curator)
- **Deliverables:** food-property catalogue food-by-food (nature + traditional
  indications per food/group) + geriatric indications, each
  **`status: staging`**, descriptive disease-indication framing, **never**
  second-person dosing, diagnosis, or quantities. Where an entry cannot be made
  safely descriptive, **drop it** and note the omission.
- **Acceptance:** every gated tip carries `status: staging`, is absent from the
  production pool (Phase 2 gate), and passes the gated-content check (descriptive,
  attributed to the tradition, no dosing/diagnosis-to-reader). Manual read of the
  highest-risk entries (cancer/diabetes/pressure mentions) against the invariant.

### Phase 7 — Index, conventions, doctor-review surface & close (content-curator → architect)
- **Deliverables:**
  - `npm run content:index`; `content:index:check` green (all tips indexed,
    `status` carried into `tips.json`).
  - Doctor-review artifact listing the gated tips (extend the existing
    `research/_private` review tooling); add a gated-tips row to
    `docs/medical-review.md` tracking pending sign-off.
  - `conventions.md` amendments: direct-conduct voice, food-catalogue citation
    convention (`work: Сова Ригпа`, chapter «Продукты и их свойства»), gated-tip
    convention (`status: staging`, descriptive-indication framing).
  - Refresh `docs/architecture/architecture.md` (tip-staging gate) + the new ADR.
  - Full gate run; **minor** bump; `CHANGELOG.md`; a `versionAnnouncements` entry
    (plain Russian, ~«Добавили десятки новых советов дня» — counts only the
    production tier, since the gated tier isn't user-visible); move plan to `done/`.
- **Acceptance:** index has all tips, no drift; gated tier provably production-
  hidden; gates green; conventions + ADR + architecture updated; medical-review
  tracks the gated tips.

## Risks / Open questions

- **Non-medical-advice invariant — the headline risk.** The gated tier *is*
  disease-indication content; stripping it of dosing/diagnosis while keeping it
  faithful is the hard part. Mitigation: the **gate** keeps it out of production
  entirely until sign-off; framing stays descriptive ("в традиции при X
  применяют Y"); Phase 6 acceptance re-reads every cancer/diabetes/pressure entry;
  **no second-person dosing ever**. The invariant overrides the count target.
- **Чжуд-ши Гл 20/21 theory↔treatment boundary.** The qualities/potency theory is
  tip-able, but the same chapters slide into "gold cures poison, silver dries
  pus" treatment claims. Mining requires a **hard cut at the theory/effects line**
  — those treatment claims are gated-tier at best, more likely dropped.
- **Quality dilution at the ceiling.** 190–200 forces granular catalogue mining +
  canonical restatements. Mitigation: choose the land-point in Phase 4; the
  practitioner audience values the materia dietetica, so terse-but-accurate food
  tips are acceptable there; don't pad the production tier to hit a number.
- **OCR citation fidelity.** Never cite an unverified OCR line — `д/л`, `щ/ш`,
  `г/ф` confusions are pervasive. Every Чжуд-ши citation is page-checked (Phase 4).
- **Theme overlap.** Constitution, incompatible foods, water, sleep are already
  covered by tips 031–060; new Чжуд-ши tips on those duplicate unless framed as
  the **canonical** source. Phase 4 dedup makes this explicit per tip.
- **Scope vs. Plans 005/012.** This adds infra (gate + ADR) those didn't. Phases
  1–2 are gated by owner sign-off before bulk authoring (dry-run-before-bulk).
- **Pre-launch exposure of gated tips** (Phase 1 open question) — ✅ **resolved
  (2026-06-29): review-only** on no bot (ADR 014). Loader default excludes
  `staging`; review via `research/_private` HTML + `docs/medical-review.md`.
- **Rotation cycle.** A ~95–100 production pool → ~3-month no-repeat cycle (the
  gated tier doesn't enter rotation). Pure index-order shuffle stays out of scope.

## Verification

- `npm run content:index && npm run content:index:check` — all tips indexed
  (production + staging), `status` present, no drift.
- `npm run typecheck && lint && test && build` — green; gate unit tests pass.
- Prove the gate: on the production path `content.tips.all` excludes every
  `status: staging` tip and `pickDailyTip` never returns one; on the index path
  all are present.
- Spot-render a production Чжуд-ши tip + a production book tip: `🌿 Совет дня` +
  body + a single clean `Источник: …` line.
- Manual read of every gated disease-indication tip and every prescriptive-derived
  production tip against the non-medical-advice rule (no dosing/diagnosis/
  second-person medical instruction).

## Progress

- [x] Phase 1 — Gating design + targets + ADR (owner-approved) — ADR 014, review-only
- [x] Phase 2 — Tip-staging gate built (dev) — `Tip.status` + `includeStagingTips`
  chokepoint + `isProductionTip` + index `status` projection + tests; gates green
- [x] Phase 3 — Чжуд-ши extracted + OCR-cleaned + chapter map — 766pp →
  `_private/zhud-shi-text.txt` (768 safe subs), `_private/zhud-shi-chapter-map.md`
  (I+II, printed=PDF−2, III/IV off-limits), README provenance
- [x] Phase 4 — Master tip outline (owner-reviewed) — `_private/tips-018-outline.md`;
  owner signed off **~165 land-point** (prod ~93 / gated ~72), high-risk gated tips
  authored behind the gate for doctor review (2026-06-29)
- [x] Phase 5 — Production tier authored (27: tips 061–087) — 13 Чжуд-ши canonical
  theory/food (Тантра объяснений, чч 2/4/6/8/9/13/16/17) + 14 Сова Ригпа
  foundations (гл 1) + elderly-lifestyle (гл 6) + food-prep (гл 4); index 87, green
- [~] Phase 6 — Gated tier authored (39 tips) then **DROPPED** — authored 30
  food-property + 9 geriatric `status: staging` tips, then **removed entirely on
  owner decision** (commit 81adeb0): food properties already in the `foods` corpus,
  geriatric out of focus. The Phase-2 gate was reverted with them; ADR 014 withdrawn.
- [x] Phase 7 — Close (reduced scope) — conventions amended (verified Чжуд-ши
  chapters + direct-conduct voice); no gate to document in architecture (reverted);
  v0.20.0, CHANGELOG + `versionAnnouncements` entry (published tier only); plan → done/
