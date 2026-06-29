# ADR 012 — `foods` content type (structured, queryable raw-ingredient properties)

**Date:** 2026-06-29
**Status:** Accepted

## Context

The owner wants the bot to answer, for raw cooking ingredients (eggs, meat,
greens, vegetables, fruits, berries, grains, …): **how warm is it, who is it for,
and what does it balance** — from the Tibetan-medicine point of view. The source
is strong and structured: гл. 4 «Продукты и их свойства» of **«Наука о здоровье.
Сова Ригпа»** (Ринчен Тензин, 2015) plus the constitution-keyed eating sections of
гл. 3, describe each food by *nature* (тёплая/прохладная, тяжёлая/лёгкая), *taste*
(кислый/сладкий/…), and *effect on each of the three начала* (Ветер / Желчь[Огонь]
/ Слизь[Земля-Вода]), with specific traditional uses.

**Plan 013 originally modelled this as guide prose** and explicitly deferred a
structured per-food type as "the tempting over-build… flag, don't build… revisit
only if users actually ask to filter foods by constitution." The owner has now
asked for exactly that filtering ("show cooling fruits", "what's good for Ветер")
— the deferral's trigger condition is met (owner interview, 2026-06-29). The
per-food data is inherently **tabular and queryable**, which prose cannot serve.

Forces that make this non-obvious / costly to reverse (so it gets an ADR, like
`Herb`/ADR 002, `Combination`/ADR 005, `Guide`/ADR 008):

- **A new frontmatter schema + stable ids** — `id`s are stable join keys; once
  authored and shipped they cannot be renamed.
- **A queryable shape, not prose** — the type exists *to be filtered* (by group,
  by constitution effect, by warmth). That is the whole reason it is not a guide.
- **Term reconciliation.** The food/constitution chapters say **Огонь** and
  **Земля-Вода**; the combination corpus and the Plan 006 fundamentals guide use
  **Желчь (Трипа)** and **Слизь (Бэкен)**. The type must store one canonical
  vocabulary and gloss the other, or readers bridging from a formula card get lost.
- **Non-medical-advice invariant.** Food→balance claims ("гранаты излечивают
  болезни Земли-Воды") are **diet/lifestyle** material, which the clarified
  framing rule permits even when phrased as guidance — the single guard is that a
  food entry must never become "you have disease X → eat remedy Y." Disease
  *taxonomy* (which начало a food pacifies/aggravates) is descriptive, not a
  diagnostic key.

## Decision

Add **`foods`** as a fifth structured content type, a first-class peer of `Herb`
and `Combination`, loaded from `content/foods/<tradition>/<id>.md`. It is a
**pull, browseable, filterable** surface in the Library hub — never pushed (it is
exempt from the proactive budget, ADR 004, like every other library card).

It governs these files:

- **`src/content/types.ts`** — new `Food` interface + `foods` `ContentBucket<Food>`
  on `LoadedContent`:
  - `id` — stable, prefixed **`food-<slug>`** (e.g. `food-apple`, `food-mutton`).
  - `tradition` — reuse `Tradition` (all `'tibetan'` for now; the food chapter is
    Sowa Rigpa).
  - `nameRu` — Russian display name; optional `nameOriginal?`.
  - `group` — a `FoodGroup` enum keying the catalogue's natural sections:
    `'grain' | 'legume' | 'oil' | 'meat' | 'egg' | 'dairy' | 'root-vegetable' |
    'green-vegetable' | 'fruit' | 'berry'`. (Extendable; an unknown value fails
    validation.)
  - `warmth` — a 5-level `Warmth` enum: `'горячая' | 'тёплая' | 'нейтральная' |
    'прохладная' | 'холодная'`. The headline "how warm is it" facet.
  - `heaviness?` — optional `'тяжёлая' | 'лёгкая'`.
  - `tastes` — `string[]` of the six-taste vocabulary (cross-links
    `tip-007-six-tastes`), e.g. `['кислый','сладкий']`.
  - `constitutions` — the "who is it for" facet, **canonical Ветер/Желчь/Слизь**
    keys each carrying an `Effect`: `{ wind: Effect; bile: Effect; phlegm: Effect }`,
    `Effect = 'pacifies' | 'neutral' | 'aggravates'`. (`bile` = the book's
    «Огонь»; `phlegm` = the book's «Земля-Вода» — glossed once in the UI.)
  - `effect` — descriptive Russian prose: what the tradition says the food
    balances / its traditional uses ("традиция связывает с…"). **Never** dosing,
    never "при болезни X примите…".
  - `cautions?`, `source?` (reuse `TipSource`), `tags`, optional `body` (longer
    descriptive prose).
- **`src/content/loader.ts`** — `parseFood(doc)` + walk `content/foods/`.
- **`src/content/validate.ts`** — unique food ids; `tradition`, `group`, `warmth`
  enums valid; each `constitutions` value a valid `Effect`; `nameRu`/`effect`
  non-empty.
- **`src/content/index-builders.ts`** — `FoodIndexEntry`
  (`id, tradition, nameRu, group, warmth, constitutions, tags`), a `foods` array,
  `counts.foods`; `scripts/build-content-index.ts` writes `foods.json` and
  `content:index:check` drift-guards it.
- **Bot surface (`src/bot/commands/library.ts`)** — a new `🥗 Продукты` hub branch
  reusing the existing anchored-session / `viewFor` / `backState` kit (ADR 009):
  browse **by group**, open a **food card** (warmth · taste · per-начало effect ·
  descriptive effect prose), and **filter** the catalogue by constitution
  (foods that pacify Ветер / Желчь / Слизь) and by warmth (тёплые / прохладные).
  Callback scope `lib:` (`lib:foods`, `lib:fg:<group>`, `lib:food:<id>`,
  `lib:ffil`, `lib:fcon:<w|b|p>`, `lib:fwarm:<key>`, paged), each ≤64 bytes via
  `assertCallbackData` (group/effect keys are short slugs, never Russian labels).
  The render-time disclaimer (ADR 006) rides the food card, as on herb cards.

The food card ships **plain text** first (ADR 002, like herb cards today). Its
property/label-stack layout is a natural future adopter of the rich-text HTML seam
(Plan 014 Phase 3, `<pre>` tables) — designed to slot in, but **not** a dependency.

## Consequences

- **Easier:** a real, queryable home for the food-properties catalogue; the bot
  can answer "cooling fruits" / "good for Ветер" directly; a clean precedent if a
  TCM food catalogue is ever added.
- **Harder:** a fifth content type the loader/validate/index and the
  `content:index:check` drift guard must cover; the **first faceted-filter UI** in
  the Library hub (groups + two cross-cutting filters), more callback surface to
  keep within the 64-byte budget; an authoring effort (~tens of foods, faithfully
  paraphrased per гл. 4).
- **Every future change must:** keep food `body`/`effect` renderer-agnostic
  (ADR 002); keep foods out of the proactive budget (ADR 004); hold the
  diet-not-treatment line (no "disease X → eat Y"); store constitutions in the
  canonical Ветер/Желчь/Слизь vocabulary and gloss Огонь/Земля-Вода in the UI.

## Alternatives considered

- **Prose guide (Plan 013's original Phase 1).** Rejected now that filtering is a
  requirement — prose cannot be queried by constitution or warmth. (A
  «Продукты и их свойства» reading guide could still co-exist later, sourced from
  the same chapter, but it is not what was asked for.)
- **Extend the `Guide` type with structured fields.** Rejected: guides are ordered
  prose sections (ADR 008); bolting per-item facets onto them conflates two kinds.
- **Reuse `Category` / a herb-style card.** Rejected: categories are subscription
  keys / grouping (ADR 007); a `Herb` has no warmth/constitution-effect facets and
  conflating foods into herbs would corrupt herb counts (the same reasoning that
  gave `Combination` its own type, ADR 005).
- **Internet-sourced food data.** Rejected (owner choice, 2026-06-29): the book +
  Чжуд-ши diet chapters cover every requested food and are more citable; the web
  is a silent cross-check only, never cited content.

## References

- ADR 002 (content in markdown), ADR 003 (portability), ADR 004 (proactive budget
  — foods exempt, pull-only), ADR 006 (render-time disclaimer), ADR 007 (generic
  categories), ADR 009 (navigation / anchored-session kit the foods browse reuses).
- ADR 005 (`Combination` type — the precedent for a new structured type),
  ADR 008 (`Guide` type — the prose alternative this rejects for foods).
- Plan 013 (book-derived guides) — restructured by the same owner interview to
  introduce this type as its lead phases; Plan 012 (citation convention).
- Source: «Наука о здоровье. Сова Ригпа», гл. 4 «Продукты и их свойства» (+ гл. 3
  constitution-keyed eating); Чжуд-ши, Тантра объяснений diet chapters (гл. 16–18).
</content>
</invoke>
