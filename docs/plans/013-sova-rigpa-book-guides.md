# Plan 013 — Book-derived guides: food properties, constitution portraits, rhythms & diagnosis

**Status:** Approved — blocked on Plan 006
**Created:** 2026-06-28
**Approved:** 2026-06-28
**Bump on close:** minor (new user-facing guide content)

## Context

The new source book **«Наука о здоровье. Сова Ригпа»** (Ринчен Тензин, 2015;
gitignored PDF + recovered text at `research/_private/nauka-zdorovye-text.txt`,
see `research/README.md`) carries three blocks of material that are **too large
and too reference-shaped to be daily tips** and map cleanly onto the **`Guide`**
content type introduced by **Plan 006 / ADR 008**:

1. **Food-properties catalogue** (гл. 4 «Продукты и их свойства») — grains,
   legumes, oils, meats, root vegetables, greens, each described by *nature*
   (warming/cooling, heavy/light), *taste*, and *effect on the three constitutions*
   (Ветер / Огонь / Земля-Вода), plus specific traditional uses. This is the
   single richest un-mined block in the book.
2. **Constitution portraits** (гл. 3 «Люди природы Ветра, Огня, Земли-Воды») —
   detailed body / gait / speech / mind / sleep / eating profiles of each of the
   three pure types and the seven mixed types. Far richer than the single
   `## Конституция человека` section the Plan 006 fundamentals guide will carry.
3. **Rhythms & diagnosis** (гл. 1–2) — the daily and annual cycle of the three
   life-principles, and how the tradition observes the body (pulse, urine,
   tongue). Best read as an **enrichment of the Plan 006 fundamentals guide**, the
   glossary anchor, rather than as standalone tips.

The owner selected food-properties, constitution portraits, and rhythms/diagnosis
for this pass; **elderly (гл. 6) is backlog** and **pregnancy/children (гл. 5) is
excluded** (quasi-medical claims).

**This is a content-authoring plan on top of existing infrastructure** — it adds
**no new content type or code**. It is the "bulk guide authoring … follow-up plan"
that **Plan 006 explicitly defers** ("Not authoring the full manla catalogue — 3
guides validate the surface; bulk authoring is a follow-up plan").

**Hard prerequisite:** **Plan 006 must be implemented and closed first** — the
`Guide` type, loader/validate/index, `splitForTelegram()`, and the `/guides`
browser all come from 006. This plan only authors `content/guides/tibetan/*.md`
and regenerates `guides.json`.

**Related:** builds on **Plan 006** (Guide type + browser) and **ADR 008**;
reuses the **book citation convention locked by Plan 012**; honours **ADR 002**
(renderer-agnostic), **ADR 004** (guides are budget-exempt, pull-only), **ADR 006**
(render-time disclaimer), and the **non-medical-advice invariant**.

**Voice:** all guides here are authored **from the start** in the source-faithful
clinical register defined by the **Plan 012 voice spec** (named mechanisms /
nyepa / source vocabulary, minimal hedging, no scare-quotes on technical terms,
no reader-directed advice or dosing) — no separate rewrite pass needed since the
guides are new.

## Goals / Non-goals

- **Goals:**
  - **Guide «Продукты и их свойства»** (`content/guides/tibetan/tib-produkty.md`)
    — `##`-delimited sections (Злаки, Бобовые, Масла и масличные, Мясо,
    Корнеплоды, Зелень и овощи, …), each ≤ `TELEGRAM_LIMIT`, descriptive prose
    faithful to the book's per-food properties.
  - **Guide «Три природы человека: Ветер, Огонь, Земля-Вода»**
    (`content/guides/tibetan/tib-tri-prirody.md`) — one `##` section per pure type
    + a section on the mixed/combined types, **strictly descriptive**
    ("традиция описывает…", never "определите свой тип и делайте X").
    Cross-references (does not duplicate) the Plan 006 fundamentals guide's
    `## Конституция человека`.
  - **Rhythms & diagnosis** folded into the **Plan 006 fundamentals guide** as two
    added sections (`## Ритмы дня и года`, `## Как тибетская медицина наблюдает
    тело`) — authored here, appended to `tib-osnovy.md` after 006 lands.
  - All new guides cite the book via the **Plan 012 convention**
    (`work: Сова Ригпа`, `part: «Наука о здоровье» (Ринчен Тензин)`, `chapter`).
  - Regenerate `content/.index/guides.json`; `content:index:check` green; CI drift
    guard covers the new files.
- **Non-goals:**
  - **No new content type, no code change** — pure authoring on Plan 006's surface.
  - **No `foods` structured/searchable data model** — the catalogue ships as guide
    prose. A queryable per-food type ("good for Ветер?") is a deliberately deferred
    future option (see Risks), not built speculatively.
  - **No elderly guide** (backlog) and **no pregnancy/children** (excluded).
  - No tip authoring or re-citing — that is Plans 005/012.
  - No new bot command — reuses the `/guides` browser from Plan 006.
  - No Chinese (TCM) guides — Tibetan-tradition source.

## Phases

### Phase 1 — Guide «Продукты и их свойства»
*Owner: content-curator.*
- **Deliverables:**
  - `content/guides/tibetan/tib-produkty.md` — frontmatter
    (`id: tib-produkty`, `tradition: tibetan`,
    `title: «Продукты и их свойства»`, book `source`, `tags`), body split into
    `##` sections grounded in гл. 4 of the book. Each section ≤ `TELEGRAM_LIMIT`.
    Paraphrased, descriptive ("в традиции считают…"); no dosing, no
    "ешьте X от болезни Y" — food *properties*, not prescriptions.
  - Cross-reference (not duplicate) `tip-007-six-tastes` and the six-tastes tips
    where the catalogue leans on taste.
- **Acceptance:** guide loads & validates; ≥5 `##` sections, each body ≤
  `TELEGRAM_LIMIT`; spot-read confirms faithful, descriptive prose; constitution
  terms match the corpus (Ветер / Огонь / Земля-Вода — note: the food chapter uses
  Земля-Вода, reconcile with the corpus's Слизь in a one-line gloss);
  `content:index:check` green.

### Phase 2 — Guide «Три природы человека»
*Owner: content-curator (ux-telegram review of the self-typing framing).*
- **Deliverables:**
  - `content/guides/tibetan/tib-tri-prirody.md` — `##` sections: intro,
    `## Природа Ветра`, `## Природа Огня`, `## Природа Земли-Воды`,
    `## Смешанные природы` (the 7-type note). Book `source` (гл. 3).
  - A one-line cross-link in/with the Plan 006 fundamentals guide's
    `## Конституция человека` so the two don't duplicate (fundamentals = the short
    glossary entry; this guide = the long portraits).
- **Acceptance:** loads & validates; descriptive throughout — **no** self-diagnose/
  self-treat framing; reads as "как традиция описывает людей", not "узнай свой тип
  и лечись"; sections ≤ `TELEGRAM_LIMIT`.

### Phase 3 — Rhythms & diagnosis into the fundamentals guide
*Owner: content-curator.*
- **Deliverables:**
  - Append two `##` sections to `content/guides/tibetan/tib-osnovy.md` (the Plan
    006 flagship): `## Ритмы дня и года` (daily/annual cycle of the three
    principles) and `## Как тибетская медицина наблюдает тело` (pulse/urine/tongue
    — **informational**, "врач смотрит…", explicitly *not* a self-diagnosis key).
  - Update that guide's `source` to credit the book alongside its existing
    citation if the new sections lean on it.
- **Acceptance:** the fundamentals guide still has every section ≤ `TELEGRAM_LIMIT`;
  the diagnosis section is purely descriptive (no "если у вас X, то…"); pager in
  `/guides` walks the added sections cleanly.

### Phase 4 — Index regen, docs & close
*Owner: content-curator → architect (close).*
- **Deliverables:**
  - `npm run content:index`; `content:index:check` green; `counts.guides` reflects
    the new guides.
  - Record any new authoring conventions in the content-curator refs.
  - Full gate run; **minor** bump; `CHANGELOG.md`; `versionAnnouncements` entry
    (plain Russian sentence — e.g. «Добавили статьи о свойствах продуктов и о трёх
    природах человека»); move plan to `done/`.
- **Acceptance:** all gates green; new guides browsable via `/guides`; index in
  sync; announcement queued.

## Risks / Open questions

- **Blocked on Plan 006.** Nothing here can start until the `Guide` type and
  `/guides` browser exist. If 006 slips, so does this. (The owner could pull the
  food catalogue forward as tips instead, but that was explicitly **not** chosen.)
- **`foods` structured type is the tempting over-build.** A per-food, queryable
  model would enable "is buckwheat good for Ветер?" search — genuinely nice, but
  speculative and multi-phase. Deferred by design; revisit only if users actually
  ask to filter foods by constitution. Flag, don't build.
- **Non-medical-advice invariant — the constitution and diagnosis material is the
  highest-risk in the whole corpus.** Portraits must stay "как традиция описывает",
  diagnosis must stay "как врач наблюдает"; neither may become a self-diagnosis or
  self-treatment key. Same hard gate as Plan 006's fundamentals guide; review these
  two phases hardest.
- **Term reconciliation: Земля-Вода vs Слизь.** The book's food/constitution
  chapters say **Земля-Вода**; the combination corpus and the Plan 006 guide use
  **Слизь (Бэкен)**. Gloss the equivalence once per guide so a reader bridging from
  a combination card isn't lost; don't silently switch vocabularies mid-text.
- **Source fidelity.** Paraphrase the book, don't lift it (honest-sourcing). The
  food catalogue is long; faithful paraphrase is slow — section the work so it can
  land incrementally.
- **Cross-link, don't duplicate.** Constitution appears in three places after this
  (Plan 006 fundamentals `## Конституция человека`, this plan's portraits guide,
  and the constitution-diet tips 031–034). Keep each at its own altitude
  (glossary / portrait / dietary tip) and cross-reference rather than repeat.

## Verification

- `npm run typecheck && npm run lint && npm test && npm run build` — green.
- `npm run content:index && npm run content:index:check` — `guides.json` in sync,
  no drift, `counts.guides` increased by the new guides.
- Manual: `/guides` lists the new titles; open «Продукты и их свойства» and page
  ◀ ▶ through its sections (no wrap at ends, indicator correct, disclaimer once on
  the last section, any overflow section splits cleanly); repeat for «Три природы
  человека»; confirm the fundamentals guide shows the two appended sections.
- Read every constitution/diagnosis section against the non-medical-advice rule.

## Progress

- [ ] Phase 1 — Guide «Продукты и их свойства» (food catalogue)
- [ ] Phase 2 — Guide «Три природы человека» (constitution portraits)
- [ ] Phase 3 — Rhythms & diagnosis sections into the fundamentals guide
- [ ] Phase 4 — Index regen, docs & close
