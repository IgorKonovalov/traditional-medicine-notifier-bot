# Plan 013 — Foods content type (raw-ingredient properties) + book-derived guides

**Status:** Approved — Phases 1–3 unblocked; Phases 5 blocked on Plan 006
**Created:** 2026-06-28
**Approved:** 2026-06-28
**Restructured:** 2026-06-29 — owner interview reshaped Phase 1. The food-properties
material is no longer a prose guide: the owner wants it **structured and
filterable** ("how warm is this fruit, who is it for, what it balances" → browse +
filter by constitution / warmth). That is a **new content type**, so this plan now
**introduces the `foods` type (ADR 012)** as its lead phases (1–3: type → browse
UI → authoring), and keeps its original constitution-portrait and rhythms guides as
the later phases (4–5). Sourcing stays **book + Чжуд-ши only**, web as a silent
cross-check (owner choice). The Phase 1 "no new content type, no code change"
premise of the original draft is **superseded for foods**.
**Bump on close:** minor (new user-facing content type, browse surface, and guides)

## Context

The source book **«Наука о здоровье. Сова Ригпа»** (Ринчен Тензин, 2015;
gitignored PDF + recovered text at `research/_private/nauka-zdorovye-text.txt`,
see `research/README.md`) carries material too large and too reference-shaped to be
daily tips:

1. **Food-properties catalogue** (гл. 4 «Продукты и их свойства», + the
   constitution-keyed eating sections of гл. 3) — grains, legumes, oils, meats
   (як/лошадь/корова/коза/баран/свинья, рыба, птица), eggs, dairy, root vegetables,
   greens, **fruits** (бананы/яблоки/груши/персики/манго/виноград/гранаты/апельсины)
   and **berries**, each described by *nature* (тёплая/прохладная, тяжёлая/лёгкая),
   *taste*, and *effect on each of the three начала* (Ветер / Желчь[Огонь] /
   Слизь[Земля-Вода]), plus specific traditional uses. The single richest un-mined
   block in the book — and **inherently tabular**.
2. **Constitution portraits** (гл. 3 «Люди природы Ветра, Огня, Земли-Воды») —
   detailed body / gait / speech / mind / sleep / eating profiles of the three pure
   types and the seven mixed types. Far richer than the single
   `## Конституция человека` section the Plan 006 fundamentals guide carries.
3. **Rhythms & diagnosis** (гл. 1–2) — the daily and annual cycle of the three
   life-principles, and how the tradition observes the body (pulse, urine, tongue).
   Best read as an **enrichment of the Plan 006 fundamentals guide**.

The owner selected food-properties, constitution portraits, and rhythms/diagnosis
for this pass; **elderly (гл. 6) is backlog** and **pregnancy/children (гл. 5) is
excluded** (quasi-medical claims).

**The food catalogue is now a structured, filterable `foods` content type**
(ADR 012), not guide prose — because the owner wants to query it by constitution
and warmth, the exact filtering Plan 006 / ADR 008 deferred until "users actually
ask." Constitution portraits and rhythms/diagnosis stay **guide prose** on the
Plan 006 surface.

**Per-phase dependency on Plan 006:**
- **Foods phases (1–3)** are **independent of Plan 006** — the `foods` type and its
  browse branch reuse the content-type pattern and the Library hub (Plan 009),
  both already shipped. They can land before Plan 006 closes.
- **Constitution-portraits guide (Phase 4)** needs only the `Guide` type +
  `/guides` browser, which **are shipped** (Plan 006 Phases 1–3, done) — unblocked.
- **Rhythms/diagnosis (Phase 5)** appends to `tib-osnovy.md`, authored in
  **Plan 006 Phase 4 (not yet done)** — **blocked on Plan 006** authoring landing.

**Related:** introduces **ADR 012** (`foods` type); builds on **Plan 009**
(Library hub / anchored-session kit) and **Plan 006 / ADR 008** (Guide type, for
the prose phases); reuses the **citation convention locked by Plan 012**; honours
**ADR 002** (renderer-agnostic), **ADR 004** (foods + guides are budget-exempt,
pull-only), **ADR 006** (render-time disclaimer), **ADR 007** (categories),
**ADR 009** (navigation), and the **non-medical-advice invariant** (scoped to
medical prescriptions; diet/lifestyle and disease taxonomy are in-bounds).

**Voice:** all authored prose follows the **Plan 012 voice spec** (source-faithful
clinical register — named начала / source vocabulary, minimal hedging, no
scare-quotes on technical terms, no reader-directed dosing).

## Goals / Non-goals

- **Goals:**
  - A structured **`Food` content type** (ADR 012): types, loader, validate,
    index, `foods.json` in the committed index + CI drift guard.
  - A **`🥗 Продукты` browse + filter surface** in the Library hub: browse by group;
    a food card showing warmth · taste · per-начало effect · descriptive effect;
    **filter** by constitution (foods that pacify Ветер / Желчь / Слизь) and by
    warmth (тёплые / прохладные).
  - An **authored food catalogue** grounded in гл. 4 (+ гл. 3 eating sections):
    all the groups the owner named — eggs, meat, greens & vegetables, fruits,
    berries — plus grains, legumes, oils, root vegetables, dairy. Descriptive,
    cited to the book.
  - **Guide «Три природы человека: Ветер, Огонь, Земля-Вода»** (constitution
    portraits) — `##`-delimited, strictly descriptive.
  - **Rhythms & diagnosis** folded into the Plan 006 fundamentals guide as two
    appended sections (after Plan 006 Phase 4 lands).
  - All gates green; minor bump; announcement queued.
- **Non-goals:**
  - **No internet-sourced content** — book + Чжуд-ши only; web is a silent
    cross-check, never cited (owner choice).
  - **No TCM (Chinese) foods** — Tibetan-tradition source only.
  - **No food↔herb/formula cross-linking** in this pass (additive later).
  - **No rich-text HTML food card** here — plain text (ADR 002), like herb cards;
    HTML adoption is Plan 014 Phase 3 territory (designed to slot in, not a dep).
  - **No push/notification of foods** — pull-only, budget-exempt.
  - **No elderly guide** (backlog), **no pregnancy/children** (excluded).
  - No tip authoring or re-citing — that is Plans 005/012.
  - No free-text food *search* integration in this pass (browse + filter only;
    folding foods into the existing `lib:search` hit list is an easy additive
    follow-up, flagged not built).

## Phases

### Phase 1 — `Food` content type: types, loader, validate, index
*Owner: dev. Introduces ADR 012. Independent of Plan 006.*
- **Deliverables:**
  - `src/content/types.ts`: `FoodGroup`, `Warmth`, `Effect` unions; `Food`
    interface (`id` prefixed `food-<slug>`, `tradition`, `nameRu`, `nameOriginal?`,
    `group`, `warmth`, `heaviness?`, `tastes: string[]`, `constitutions: { wind;
    bile; phlegm }` each an `Effect`, `effect: string`, `cautions?`, `source?`
    reusing `TipSource`, `tags`, optional `body`); extend `LoadedContent` with
    `foods: ContentBucket<Food>`.
  - `src/content/loader.ts`: `parseFood(doc)` reading the frontmatter; walk
    `content/foods/` into `loadContent`.
  - `src/content/validate.ts`: `assertUniqueIds(foods,…)`; assert `tradition`,
    `group`, `warmth` enums; each `constitutions` value a valid `Effect`;
    non-empty `nameRu` and `effect`.
  - `src/content/index-builders.ts`: `FoodIndexEntry` (`id, tradition, nameRu,
    group, warmth, constitutions, tags`); `counts.foods` + `foods` array;
    `scripts/build-content-index.ts` writes `content/.index/foods.json`.
- **Acceptance:** `npm run typecheck` clean; a sample food loads; a malformed food
  (bad group/warmth/effect, dup id, empty `effect`) fails boot with a file-pathed
  error; `npm run content:index` writes `foods.json`; `content:index:check` green.

### Phase 2 — `🥗 Продукты` browse + constitution/warmth filter (Library hub)
*Owner: dev (with ux-telegram review of the filter flow & wording).*
- **Deliverables:**
  - `src/bot/commands/library.ts`: a `🥗 Продукты` hub branch reusing the anchored
    session / `viewFor` / `backState` kit (ADR 009). New `Screen`s:
    `food-groups` (list the `FoodGroup`s present, with counts), `food-filter`
    (pick a constitution or a warmth band), `food-list` (foods in the selected
    group **or** matching the active filter), `food-card`.
  - **Food card** (plain text): `nameRu`, warmth (+ heaviness), tastes, the three
    начала with their effect (pacifies/neutral/aggravates — glossed
    Желчь≈Огонь, Слизь≈Земля-Вода once), the descriptive `effect` prose, cautions;
    **render-time disclaimer** (ADR 006). All Russian strings via a
    `messages.foods.*` formatter — none in handlers.
  - Callbacks under `lib:` — `lib:foods`, `lib:fg:<group>`, `lib:food:<id>`,
    `lib:ffil`, `lib:fcon:<w|b|p>`, `lib:fwarm:<warm|cool>`, paged
    (`lib:fglist:<n>`, `lib:flpg:<n>`) + `:noop`s; every payload through
    `assertCallbackData`, short slugs only (≤64 bytes), never Russian labels.
  - Register the branch + the `lib:home`/`lib:back` wiring; add a `/foods` command
    that opens the hub on the foods groups screen (mirrors `/guides`); mention it
    in `/help`. Add `messages.library.foods = '🥗 Продукты'` to the hub.
- **Acceptance:** `/foods` lists groups; opening a group lists its foods; a food
  card shows all facets + disclaimer; the constitution filter lists foods that
  pacify the chosen начало; the warmth filter lists тёплые / прохладные;
  `« Назад` / `🏠 В меню` navigate correctly; every other library branch renders
  byte-identically to before; `callback_data` within limit; lint passes the
  no-Telegraf-outside-`src/bot/` rule.

### Phase 3 — Author the food catalogue
*Owner: content-curator.*
- **Deliverables:**
  - `content/foods/tibetan/*.md` — one file per food, grounded in гл. 4 (+ гл. 3
    eating sections), covering the groups the owner named and the rest of the
    chapter: **eggs, meat** (як, лошадь, корова, коза, баран, свинья, рыба, птица),
    **greens & vegetables, fruits** (бананы, яблоки, груши, персики/абрикосы,
    манго, виноград, гранаты, апельсины), **berries** (арбуз, дыня, тыква, кислые
    ягоды), grains, legumes, oils, root vegetables, dairy. Each: `warmth`, `tastes`,
    per-начало `constitutions`, descriptive `effect`, book `source` via the
    Plan 012 convention. Paraphrased, descriptive ("в традиции считают…"); **no
    dosing, no "ешьте X от болезни Y"** — food *properties*, not prescriptions.
  - Cross-reference (not duplicate) `tip-007-six-tastes` where taste drives the
    effect; gloss Желчь≈Огонь and Слизь≈Земля-Вода consistently with the corpus.
  - Regenerate `content/.index/foods.json`.
- **Acceptance:** every food loads & validates; the warmth/constitution facets are
  populated from the book (spot-checked against the source lines, e.g. eggs =
  горячая, виноград = прохладная, баран = тёплая+тяжёлая); spot-read confirms
  faithful, descriptive prose with no diagnostic/dosing framing;
  `content:index:check` green; the Phase 2 filters return sensible sets.

### Phase 4 — Guide «Три природы человека» (constitution portraits)
*Owner: content-curator (ux-telegram review of the self-typing framing). Uses the
shipped Guide type — unblocked.*
- **Deliverables:**
  - `content/guides/tibetan/tib-tri-prirody.md` — `##` sections: intro,
    `## Природа Ветра`, `## Природа Огня`, `## Природа Земли-Воды`,
    `## Смешанные природы` (the 7-type note). Book `source` (гл. 3).
  - A one-line cross-link to the Plan 006 fundamentals guide's
    `## Конституция человека` so the two don't duplicate (fundamentals = the short
    glossary entry; this guide = the long portraits).
- **Acceptance:** loads & validates; descriptive throughout — **no** self-diagnose/
  self-treat framing; reads as "как традиция описывает людей", not "узнай свой тип
  и лечись"; sections ≤ `TELEGRAM_LIMIT`.

### Phase 5 — Rhythms & diagnosis into the fundamentals guide
*Owner: content-curator. **Blocked on Plan 006 Phase 4** (authors `tib-osnovy.md`).*
- **Deliverables:**
  - Append two `##` sections to `content/guides/tibetan/tib-osnovy.md`:
    `## Ритмы дня и года` (daily/annual cycle of the three principles) and
    `## Как тибетская медицина наблюдает тело` (pulse/urine/tongue —
    **informational**, "врач смотрит…", explicitly *not* a self-diagnosis key).
  - Update that guide's `source` to credit the book alongside its existing citation
    if the new sections lean on it.
- **Acceptance:** the fundamentals guide still has every section ≤ `TELEGRAM_LIMIT`;
  the diagnosis section is purely descriptive (no "если у вас X, то…"); the
  `/guides` pager walks the added sections cleanly.

### Phase 6 — Index regen, docs & close
*Owner: content-curator → architect (close).*
- **Deliverables:**
  - `npm run content:index`; `content:index:check` green; `counts.foods` +
    `counts.guides` reflect the new content.
  - Refresh `docs/architecture/architecture.md` (new `foods` type + the foods
    browse branch), `CLAUDE.md` (foods bucket; `🥗 Продукты` hub branch), and flip
    **ADR 012** References to point at this plan; record the `Food` schema +
    book-citation convention in the content-curator refs.
  - Full gate run; **minor** bump; `CHANGELOG.md`; `versionAnnouncements` entry
    (plain Russian sentence — e.g. «Добавили раздел о свойствах продуктов: тепло,
    вкус и для кого они подходят»); move plan to `done/`.
- **Acceptance:** all gates green; foods browsable + filterable via `🥗 Продукты`;
  the two guides browsable via `/guides`; index in sync; announcement queued.

## Risks / Open questions

- **`foods` is a real build, not authoring.** Phases 1–2 add a content type + the
  hub's first faceted-filter UI. Scoped to reuse the existing content-type pattern
  and the Plan 009 anchored-session kit — do not invent new session machinery.
- **Term reconciliation: Огонь/Земля-Вода vs Желчь/Слизь.** The book's food chapter
  says Огонь and Земля-Вода; the corpus and the Plan 006 guide use Желчь (Трипа) and
  Слизь (Бэкен). Store the canonical Ветер/Желчь/Слизь keys (ADR 012); gloss the
  book's terms once per surface so a reader bridging from a formula card isn't lost.
- **Non-medical-advice invariant — diet is in-bounds, treatment is not.** Food
  properties and which начало a food pacifies are descriptive diet/taxonomy
  (permitted by the clarified framing rule). The single guard: a food entry must
  never read "при болезни X ешьте Y как лекарство." The constitution-portraits and
  diagnosis material (Phases 4–5) is the highest-risk — portraits stay "как традиция
  описывает", diagnosis stays "как врач наблюдает"; review those hardest.
- **Filter UX surface.** Two cross-cutting filters (constitution, warmth) plus
  group browse is more callback surface than any existing branch — keep payloads to
  short slugs, lean on `assertCallbackData`, and have ux-telegram sanity-check that
  the filter entry points are discoverable and the result lists labelled clearly.
- **Authoring breadth.** The catalogue is wide (~30–50 foods across 10 groups).
  Section the authoring by group so Phase 3 can land incrementally; the Phase-2 UI
  works with whatever subset is authored.
- **Cross-link, don't duplicate.** Constitution now appears in four places (Plan 006
  fundamentals `## Конституция человека`, this plan's portraits guide, the
  constitution-diet tips 031–034, and each food's per-начало facet). Keep each at
  its own altitude and cross-reference rather than repeat.
- **Free-text search for foods** is deferred — browse + filter only. Folding foods
  into the existing `lib:search` hit list is an easy additive follow-up; flagged.

## Verification

- `npm run typecheck && npm run lint && npm test && npm run build` — green.
- `npm run content:index && npm run content:index:check` — `foods.json` + the
  guide entries in sync, no drift; `counts.foods` and `counts.guides` increased.
- Manual: `/foods` → groups list → open «Фрукты» → open «Яблоко» (warmth, taste,
  per-начало effect, descriptive effect, disclaimer once); back to groups; open the
  **filter** → «Ветер» → list of foods that pacify Ветер; → warmth «прохладные» →
  cooling foods. `/guides` lists «Три природы человека»; page ◀ ▶ through it; the
  fundamentals guide shows the two appended sections (after Plan 006 lands).
- Read every food `effect`, constitution portrait, and diagnosis section against the
  non-medical-advice rule (no disease→remedy prescription).

## Progress

- [ ] Phase 1 — `Food` content type: types, loader, validate, index (ADR 012)
- [ ] Phase 2 — `🥗 Продукты` browse + constitution/warmth filter
- [ ] Phase 3 — Author the food catalogue (eggs, meat, fruits, berries, greens, …)
- [ ] Phase 4 — Guide «Три природы человека» (constitution portraits)
- [ ] Phase 5 — Rhythms & diagnosis into the fundamentals guide (blocked on Plan 006)
- [ ] Phase 6 — Index regen, docs & close
</content>
