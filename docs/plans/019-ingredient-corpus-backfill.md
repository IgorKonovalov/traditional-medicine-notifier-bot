# Plan 019 — Ingredient corpus backfill & formula→ingredient cross-link

**Status:** Approved — 2026-06-29
**Created:** 2026-06-29
**Completed:** —
**Bump on close:** minor

## Context

Today **exactly one** ingredient page is reachable at runtime — `tib-haritaki`
(Миробалан хебула). The Tibetan visibility gate (`src/content/visibility.ts`,
`VISIBLE_TRADITIONS = ['tibetan']`, ADR 013) hides the two Chinese herbs, so the
`📚 Библиотека → 🌿 Травы` branch fronts a **single card** and its two
sub-screens are degenerate: `Все травы` lists one item and `По категории` shows
one populated category (`digestive-herbs`). The category subsystem
(`content/categories/`) currently serves **only** herbs and is near-dead weight
at this size.

Meanwhile the formula browser (live since Plan 017, gate
`FORMULA_BRANCH_ENABLED = true`) renders a tappable member button per resolved
ingredient via `formulaMemberLinks` (`src/bot/commands/_formula-card.ts:48`),
which resolves a formula's `members:` ids against `herbs.byId` and **silently
drops any id without a page**. Because only haritaki has a page, the rich
ingredient lists practitioners actually care about are inert text.

Two facts from corpus analysis (2026-06-29) shape this plan:

1. **Member ids are hand-curated, not derived.** Across all 149 formulas the
   `members:` block contains *only* `tib-haritaki` (94 files); 55 files have no
   `members:` block at all. The real ingredient lists live in the free-text
   `composition:` field as `Русское название (Latin binomial)`. **Authoring
   ingredient pages alone lights up nothing** — each formula's `members:` array
   must also be populated with the new ids. This is the load-bearing half.
2. **The Latin-join has a ceiling of ~65 formulas.** 84 of 149 list composition
   Russian-only (no Latin binomial), so no botanical-name match is possible for
   them without first enriching their composition text. The reachable population
   for automated member-mapping is the **65** Latin-bearing formulas.

### Scope: "ingredients", not just "herbs" (display rename, ~35 items)

The owner asked to widen scope to **~35 items including non-botanicals**
(minerals, resins, animal materia medica) and to **present the branch as
«Ингредиенты»**. This is a **display-only rename**, following the **Plan 017
precedent** (the formula branch is *labelled* «Составы» while all code, ids,
callbacks, and the `Combination` type keep "formula/combination" vocabulary):

- **UI label** `messages.menu` / library-hub copy changes from «🌿 Травы» to
  «🌿 Ингредиенты» (final emoji owner's call).
- **Code, the `Herb` type, the `tib-` id prefix, `herbs.byId`, `lib:herb:` /
  `herb:` callbacks, `content/herbs/` directory** all keep "herb" vocabulary —
  stable join keys are never renamed (CLAUDE.md). Minerals/animal items are
  authored as `herb`-typed content with `tib-` ids (`tib-shilajit`,
  `tib-calcite`, `tib-musk`). The type is generic enough; widening the *label*
  costs one string, a full type rename buys nothing.

No new ADR — this mirrors the documented Plan 017 split; CLAUDE.md gets a
one-line note at close.

### Impact ranking (formula frequency; includes minerals/animal members)

| Rank | Latin / id | Russian | # formulas |
|---|---|---|---|
| 1 | *Terminalia chebula* | Миробалан хебула | 34 — **authored = haritaki** |
| 2 | *Saussurea lappa* | Соссюрея / костус | 22 |
| 3 | *Carthamus tinctorius* | Сафлор | 21 |
| 4 | *Elettaria cardamomum* | Кардамон | 21 |
| 5 | *Emblica officinalis* | Эмблика (амалаки) | 18 |
| 6 | *Piper longum* | Перец длинный (пиппали) | 17 |
| 7 | *Myristica fragrans* | Мускатный орех | 16 |
| 8 | *Bambusa textilis* | Бамбуковая манна | 16 |
| 9 | *Inula racemosa* | Девясил | 16 |
| 10 | *Punica granatum* | Гранат | 16 |
| 11 | *Terminalia bellirica* | Терминалия беллерика | 15 |
| 12 | *Eugenia caryophyllata* | Гвоздика | 15 |
| 13 | *Amomum subulatum* | Амомум (чёрный кардамон) | 10 |
| 14 | *Cinnamomum zeylanicum* | Корица | 10 |
| 15 | *Aquilaria agallocha* | Орлиное дерево (агар) | 9 |
| 16 | *Tinospora cordifolia* | Тиноспора | 9 |
| 17 | *Hedychium spicatum* | Кемпферия | 9 |
| 18 | *Pterocarpus santalinus* | Красный сандал | 8 |
| 19 | *Swertia chirata* | Сверция | 8 |
| 20 | *Santalum album* | Белый сандал | 8 |
| 21 | *Zingiber officinale* | Имбирь | 7 |
| 22 | *Veronica ciliata* | Вероника | 7 |
| 23 | *Melia composita* | Мелия | 6 |
| 24 | *Rubus idaeopsis* | Малина | 6 |
| 25 | *Picrorhiza kurroa* | Кутки | 6 |
| 26 | *Shilajit* | Мумиё (смола) | 6 — **mineral/resin** |
| 27 | *Calcite* | Кальцит | 5 — **mineral** |
| 28 | *Mesua ferrea* | Мезуя железная | 4 |
| 29 | *Shorea robusta* | Шорея (саловое дерево) | 4 |
| 30 | *Rubia cordifolia* | Марена | 4 |
| 31 | *Geranium sp.* | Герань | 4 |
| 32 | *Glycyrrhiza uralensis/glabra* | Солодка | 4 (+3) |
| 33 | *Hippophae rhamnoides* | Облепиха | 4 |
| 34 | *Dracocephalum tanguticum* | Змееголовник | 4 |
| 35 | *Moschus moschiferus* | Мускус | 4 — **animal** |

**Coverage curve** (formulas gaining ≥1 clickable member): top-12 → **52/149**
formulas + 227 links; top-25 → 53/149 + 330; **top-35 → 53/149 + 373 links**.
Formula coverage plateaus at ~53 because the 84 Russian-only formulas can't be
matched; the extra items past 25 add **link density** (+43) and, more
importantly, a **35-item browse list** that makes the branch earn its slot —
including minerals/animal members so those composition lines resolve too.

Related: ADR 013 (visibility gate), ADR 006 (non-medical framing), ADR 007
(generic categories), Plan 017 (formula branch live + display/code vocab split),
Plan 013 (Food).

## Goals / Non-goals

- **Goals:**
  - Author **34 new Tibetan ingredient pages** (ranks 2–35: botanicals +
    мумиё/кальцит/мускус), bringing the visible corpus from 1 → **35**.
  - **Populate `members:` arrays** across the 65 Latin-bearing formulas so member
    buttons resolve — the cross-link gap closes (~373 links).
  - **Display-rename** the branch to «Ингредиенты» (label/copy only; code, type,
    ids, callbacks unchanged — Plan 017 precedent).
  - Make `По категории` meaningful: distribute the 35 items across **5–6
    categories** (reuse existing; add e.g. согревающие специи, очищающие жар,
    ароматические, минералы и смолы).
  - Keep `content/.index/` in sync; all gates green.
  - Hold the non-medical-advice framing (descriptive, never prescriptive) per
    ADR 006 and [[guide-framing-scope]].

- **Non-goals:**
  - Enriching the 84 Russian-only formula compositions with Latin names —
    flagged as the coverage ceiling, deferred (optional Phase 6).
  - **Any code rename** of `Herb`/`tib-`/`lib:herb:`/`content/herbs/` — label
    only.
  - Re-surfacing Chinese herbs (ADR 013 stands).
  - Changes to herb-card *rendering*, the formula gate, or search plumbing — all
    already work; this plan is content + member-data + one label.

## Phases

### Phase 1 — Ranking artifact, id convention & member map (dev)
- **Deliverables:**
  - Committed mapping artifact `research/ingredient-member-map.json`: per target
    item `{ latin (+synonyms), herbId, nameRu, category, freq, kind:
    botanical|mineral|animal }` for the 34 targets. Drives authoring (Phase 3/4)
    and member backfill (Phase 5). Seeded from the table above.
  - **Id convention:** `tib-<slug>` (common/transliterated name), e.g.
    `tib-saussurea`, `tib-cardamom`, `tib-amla`, `tib-long-pepper`,
    `tib-safflower`, `tib-shilajit`, `tib-calcite`, `tib-musk`. Stable join keys.
  - **Member-backfill script** (`scripts/backfill-members.mjs` or
    `content:members` task): per formula, scan `composition:`, match Latin
    binomials (incl. listed synonyms; comma/slash tolerant) against the map,
    write resolved ids into `members:` — **idempotent**, **preserves existing
    `tib-haritaki`**, dedups, sorts. **Dry-run mode** prints a per-formula diff
    for review before any write ([[owner-working-style]]: dry-run before bulk).
- **Acceptance:** `--dry-run` prints a sane proposed-member diff for the 65
  Latin-bearing formulas; no writes. Map + slugs reviewed by owner.

### Phase 2 — Display-rename branch to «Ингредиенты» (dev / ux-telegram)
- **Deliverables:** update the user-facing label(s) only — `messages.menu` /
  `messages.library.*` copy from «Травы» → «Ингредиенты» (and any "Все травы" /
  "По категории" sub-labels). Code, callbacks, ids, `Herb` type untouched. Final
  emoji owner's choice (default keep 🌿).
- **Acceptance:** bot shows «Ингредиенты» in the hub + sub-menu; all callbacks
  still route (`lib:herbs`, `lib:herb:<id>`); typecheck/lint green.

### Phase 3 — Author tier-1 ingredients (content-curator, ranks 2–18, 17 items)
- **Deliverables:** 17 files `content/herbs/tibetan/tib-<slug>.md` for the
  highest-frequency botanicals. Each follows the existing frontmatter schema
  (`id`, `tradition: tibetan`, `category`, `name_ru`, `name_latin`, optional
  `name_original` Tibetan, `properties[]`, `uses[]`, `cautions[]`, `tags[]`) + a
  short descriptive Russian body. Any source acceptable (owner sign-off); cite
  loosely (bimala.ru / manla.ru / general materia medica).
- **Acceptance:** 18 files validate (incl. haritaki); `npm run content:index`
  regenerates; framing descriptive, disclaimer appended at render time (ADR 006).

### Phase 4 — Author tier-2 ingredients (ranks 19–35, 17 items) + categories
- **Deliverables:**
  - 17 more files for ranks 19–35, **including the non-botanicals** мумиё
    (`tib-shilajit`), кальцит (`tib-calcite`), мускус (`tib-musk`) — authored as
    `herb`-typed content with descriptive bodies appropriate to a mineral/animal
    material. Corpus reaches **35**.
  - **Category distribution:** assign every item a `category`; reuse
    `digestive-herbs` / `tonic-herbs` and add **3–4 new category files** under
    `content/categories/` (candidates: `warming-spices` «согревающие специи»,
    `heat-clearing-herbs` «очищающие жар», `aromatic-herbs` «ароматические»,
    `minerals-resins` «минералы и смолы»). Aim ≥3 items per category.
- **Acceptance:** `По категории` shows ≥5 populated categories; index in sync.

### Phase 5 — Backfill `members:` across formulas (dev + curator)
- **Deliverables:** run the Phase-1 script for real across the 65 Latin-bearing
  formulas; curator spot-reviews the diff (synonym/ambiguity cases — e.g.
  *Glycyrrhiza uralensis* vs *glabra* both → `tib-licorice`; *Saussurea
  lappa/costus*; *Eugenia/Syzygium caryophyllata*). Regenerate `content/.index/`.
- **Acceptance:** `formulaMemberLinks` resolves ~370 member buttons across ~53
  formula cards; spot-check 5 cards (Агар-15 etc.) shows multiple tappable member
  buttons opening the correct ingredient cards; `content:index:check` clean.

### Phase 6 — (optional, deferred) Russian-only composition enrichment
- **Deliverables:** for the 84 Latin-less formulas, add Latin binomials to
  `composition:` (or hand-curate `members:` by Russian name) to extend coverage
  past 65 formulas. **Out of scope unless owner opts in** after Phase 5 results.

## Risks / Open questions

- **Synonym/collision handling.** A few formulas write genus-only or synonyms;
  the map must list accepted synonyms per item so the script matches. Curator
  review in Phase 5 catches misses.
- **Mineral/animal voice.** Mineral/resin/animal cards (мумиё, кальцит, мускус)
  use the same descriptive, non-prescriptive framing; keep claims traditional
  ("традиционно применяется…"), never dosing/treatment ([[guide-framing-scope]]).
- **Coverage honesty.** Link coverage caps at ~53/149 formulas regardless of item
  count, because 84 formulas are Russian-only. Don't imply "all 149 light up";
  Phase 6 is the lever if the owner wants more.
- **Category proliferation.** 5–6 categories total is the target, not one per
  item.
- **Voice.** Audience is practitioners ([[target-audience-and-voice]]) — clinical,
  source-faithful, no new-age filler.

## Verification

- `npm run content:index && git diff --stat content/.index` — regenerates, no
  unexpected drift.
- `npm run typecheck && npm run lint && npm test && npm run build &&
  npm run content:index:check` — all green.
- Manual (bot): `📚 Библиотека → 🌿 Ингредиенты → Все травы` lists 35 items;
  `По категории` shows ≥5 populated categories; open a formula card (Агар-15,
  Бригунг-25, …) and confirm multiple member buttons resolve to ingredient cards;
  🔎 Поиск returns new items; an ingredient card shows "Входит в составы".

## Progress

- [x] Phase 1 — ranking artifact, id convention, member-backfill script (042eb7c).
      Map + slugs owner-approved 2026-06-29. Dry-run: 53 formulas / 441 links.
      Corpus has **56** Latin-bearing formulas (plan estimated 65); ~93 Russian-only.
- [x] Phase 2 — display-rename branch to «Ингредиенты» (13ff67a). Label/copy only.
- [x] Phase 3 — author tier-1 ingredients (ranks 2–18, 17) (da59f99)
- [x] Phase 4 — author tier-2 ingredients (ranks 19–35, 17) + categories (da59f99).
      Corpus 1 → 35; 4 new categories (warming-spices, heat-clearing-herbs,
      aromatic-herbs, minerals-resins); 6 populated categories total.
- [x] Phase 5 — backfill `members:` across formulas + regen index (6259760).
      53 formulas gained members; 441 links across 113 cards; 0 unresolved.
- [ ] Phase 6 — (deferred) Russian-only composition enrichment — not started.

**Close pending (architect):** review → move to `done/`, minor version bump
(0.20.0 → 0.21.0) + `versionAnnouncements` entry + CLAUDE.md one-line note on the
«Ингредиенты» display/code split. Not auto-done (CLAUDE.md: plans reviewed before
`done/`; version bump is the architect close ritual).
