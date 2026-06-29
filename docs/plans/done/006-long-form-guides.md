# Plan 006 — Long-form guides: content type, split delivery & browse

**Status:** Completed
**Created:** 2026-06-26
**Approved:** 2026-06-26
**Completed:** 2026-06-29 — v0.14.0; all phases shipped (Phase 3 folded into the
library hub, owner-approved; see Progress)
**Amended:** 2026-06-26 — flagship first guide is now «Основы тибетской медицины»
(fundamentals: three ньепа + Жар/Холод), sourced from `manla.ru/base/`; this
becomes guide #1 in Phase 4 (owner request). Seasonal-eating guides drop to two.
**Amended:** 2026-06-28 — an authoritative source book,
**«Наука о здоровье. Сова Ригпа»** (Ринчен Тензин, 2015; text at
`research/_private/nauka-zdorovye-text.txt`), is now available and is a **stronger,
more citable source** than `manla.ru/base/` for the constitution material. When
authoring this plan's fundamentals guide (Phase 4, the `## Конституция человека`
section), **prefer the book** (cite via the Plan 012 convention) over manla for
that section. The book's richer constitution portraits, its food-properties
catalogue, and its rhythm/diagnosis material are **not** in this plan's scope —
they are the deferred "bulk guide authoring follow-up" this plan anticipates, now
spec'd as **Plan 013** (blocked on this plan landing first). When authoring the
guides here, follow the **source-faithful clinical voice spec from Plan 012**
(named mechanisms / source vocabulary, minimal hedging, no scare-quotes on
technical terms, no reader-directed advice) rather than the softer register of the
early tips.
**Amended:** 2026-06-28 — audience clarified: the bot targets **practitioners
already inside the Sowa Rigpa / Tibetan-Buddhist tradition**, not a general
wellness audience. This is the *rationale* for the clinical register the prior
amendment mandates — author in source-faithful medical language (named
доша/ньепа, пищеварительный огонь, Жар/Холод, named principles; minimal hedging),
**not** the soft wellness voice. This shifts **register only**: the
non-medical-advice **stance** guards in Phase 4 (descriptive framing, no
diagnosis/dosing, no "if you have X then Y") are unchanged — holding stance fixed
is what keeps "medical/raw" from drifting into prescription.
**Bump on close:** minor (new user-facing content type + command)

## Context

The corpus has no home for **long-form reference articles** — multi-thousand-word
Sova-Rigpa pages such as the `https://manla.ru/info/` seasonal-eating section
(~3,000 words, table-structured). These are too big for a tip and are a category
error inside the herb/combination card model. The owner wants them surfaced as
"a list of helpful pages" the user pulls up and reads.

**Why a fundamentals guide leads.** The whole combination corpus (165 files)
already leans on `Ветер`, `Жар`, `Слизь`, `Кровь` and compound terms like
"Пустой и Незрелый Жар" / "колик Ветра" (see `tib-formula-agar-15.md`) with **no
explainer anywhere**. A guide on the **basics of Tibetan medicine** — the three
ньепа (Ветер/rLung, Желчь/Трипа, Слизь/Бэкен), the five первоэлементы, and the
Жар/Холод disease-nature duality — is the natural **glossary anchor** for the
bot, a stronger first guide than seasonal eating and a future cross-link target
from combination cards. Its source is the `manla.ru/base/` fundamentals section
(distinct from the `/info/` advice pages), mapping to the **Чжуд-ши, Тантра
основ**.

**ADR 008** decided the shape: a new **`guide`** *pull* content type, delivered
as **authored sections** (one per message) with a **generic splitter safety
net**, browsed via a paginated `/guides` entry, **exempt from the proactive
budget** (ADR 004) and **independent of tips** (Plan 005 proceeds unchanged).
This plan operationalizes ADR 008.

Today the bot **clamps** long bodies (`clampToTelegram`, `src/bot/render/markdown.ts`)
— it does not split. This feature delivers the long-deferred message-splitter.

**Related:** implements **ADR 008**; reuses the `TipSource` shape from **Plan
003**; honors **ADR 002** (renderer-agnostic content), **ADR 004** (budget — guides
exempt), **ADR 006** (render-time disclaimer); runs alongside **Plan 005** (tips).

## Goals / Non-goals

- **Goals:**
  - A `Guide` content type (`content/guides/<tradition>/<id>.md`) loaded, validated
    and indexed exactly like the other buckets.
  - A `splitForTelegram()` helper that chunks any text on paragraph boundaries.
  - A browsable `/guides` flow: list titles → open a guide → page through its
    sections with ◀ ▶ / "к списку" inline navigation.
  - At least **3 authored guides**, descriptively framed: the **flagship
    fundamentals guide** «Основы тибетской медицины» (from `manla.ru/base/`,
    ~7–8 sections) plus **two** shorter `manla.ru/info` guides (seasonal eating
    + one more), to prove the end-to-end path across both source sections.
  - All gates green; `guides.json` in the committed index; CI drift guard covers it.
- **Non-goals:**
  - **Not** authoring the full manla catalogue — 3 guides validate the surface;
    bulk authoring is a follow-up plan.
  - No structured season×facet data model — markdown sections only (ADR 008).
  - No tip↔guide deep-linking yet (ADR 008 allows it later; not in this plan).
  - No push/notification of guides — pull-only, budget-exempt.
  - No Chinese (TCM) guides this pass — Tibetan-tradition manla source.
  - No change to tips (Plan 005), herbs, or combinations.

## Phases

### Phase 1 — `Guide` content type: types, loader, validate, index
*Owner: dev.*
- **Deliverables:**
  - `src/content/types.ts`: `GuideSection { heading: string; body: string }` and
    `Guide { id; tradition; title; source?: TipSource; tags: string[]; sections:
    GuideSection[] }`; extend `LoadedContent` with `guides: ContentBucket<Guide>`.
  - `src/content/loader.ts`: `parseGuide(doc)` — read frontmatter (`id`,
    `tradition`, `title`, optional `source` via existing `parseTipSource`, `tags`)
    and **split the markdown body into sections on `##` headings** (the section
    delimiter convention; text before the first `##` is an intro section).
    Wire `readDir(join(contentDir,'guides')).map(parseGuide)` into `loadContent`.
  - `src/content/validate.ts`: `assertUniqueIds(guides,…)`; assert `tradition`
    enum; assert each guide has ≥1 non-empty section and a non-empty `title`.
  - `src/content/index-builders.ts`: `GuideIndexEntry { id; tradition; title;
    sectionCount; source? }`; add to `ContentIndex.counts.guides` and the
    `guides` array; regenerate via `scripts/build-content-index.ts`.
- **Acceptance:** `npm run typecheck` clean; a sample guide loads; a malformed
  guide (no sections / bad tradition / dup id) fails at boot with a file-pathed
  error; `npm run content:index` writes `content/.index/guides.json`;
  `content:index:check` green.

### Phase 2 — `splitForTelegram()` + render plumbing
*Owner: dev.*
- **Deliverables:**
  - `src/bot/render/markdown.ts`: `splitForTelegram(text: string): string[]` —
    return `[text]` when within `TELEGRAM_LIMIT`; otherwise split on blank-line
    paragraph boundaries, packing paragraphs into ≤`TELEGRAM_LIMIT` chunks; a
    single oversized paragraph falls back to the existing word-boundary cut.
    Keep `clampToTelegram` for single-card surfaces.
  - A small `renderGuideSection(section)` that produces the plain-text body for a
    section (heading + `toPlainText(body)`), ready to be split if needed.
  - Unit tests: under/over limit, exact boundary, multi-paragraph packing,
    pathological single huge paragraph, emoji/Unicode length.
- **Acceptance:** `npm test` green; no chunk exceeds `TELEGRAM_LIMIT`; ordering
  and content are preserved (concatenation round-trips the input minus split
  whitespace).

### Phase 3 — `/guides` browse + section pager
*Owner: dev (with ux-telegram review of the flow & wording).*
- **Deliverables:**
  - `src/bot/commands/guides.ts`: `/guides` lists guide titles as inline buttons
    (grouped/picker consistent with `browse.ts`); selecting one renders section 1.
  - **Pager:** inline ◀ ▶ buttons + "к списку"; navigation edits the message in
    place (`editMessageText`) and shows a position indicator (e.g. «2 / 5»). If a
    section overflows, send its `splitForTelegram` chunks (last chunk carries the
    pager).
  - `src/bot/session-store.ts`: add `SessionKind 'guide'`; store
    `{ guideId, sectionIndex }`; `callback_data` stays within Telegram's 64-byte
    budget (use the guide id + index, not titles).
  - Register in `src/bot/index.ts`; add a `/guides` mention to `/help`.
  - **Disclaimer** appended at render time on the **final** section (ADR 006
    pattern), via a `messages.guide.*` formatter — all Russian strings in
    `messages.ts`.
  - Optional: a "📚 Статьи" entry into the existing `/browse` picker.
- **Acceptance:** `/guides` lists titles; opening one paginates correctly at both
  ends (no wrap past first/last); position indicator correct; disclaimer shows
  once on the last section; overflow section splits cleanly; `callback_data`
  within limit; lint passes the no-Telegraf-outside-`src/bot/` rule.

### Phase 4 — Author the first guides (≥3)
*Owner: content-curator.*

- **Source grounding (cross-checked).** The flagship is grounded in the **Чжуд-ши
  canon** (`research/zhud_shi_canon.pdf`, gitignored/local), not just manla. The
  three доша — natures, the five subtypes each, and the property lists — come from
  **Тантра объяснений, гл. 5 «Существенные признаки тела»**; constitution from
  **гл. 6 «Деяния и типы телосложения»**; Жар/Холод types from the Тантра
  наставлений fever section. manla.ru/base is the structural/secondary paraphrase
  source. Full reconciliation in `research/_private/fundamentals-canon-crosscheck.md`.
  Two authoring rules fall out:
  - **Use canon-faithful subtype names** (the section list below already does);
    manla's variants (e.g. «Восходящий», «Огнеподобный») may be glossed once in
    parentheses but are not the headline term.
  - **The canon vocabulary already matches the corpus** — «жар пустой / незрелый /
    застарелый / мутный», «жар между степью и горой» appear in both the canon and
    cards like `tib-formula-agar-15.md`. Match those spellings so the guide reads
    as the glossary for the combination cards. In the intro, bridge the three
    registers: **доша** (trakat term) = **ньепа / «три начала»** (popular) =
    plain **Ветер/Желчь/Слизь** (corpus).
- **Deliverable 4a — Flagship: «Основы тибетской медицины»** (`content/guides/
  tibetan/tib-osnovy.md`). Frontmatter: `id: tib-osnovy`, `tradition: tibetan`,
  `title: «Основы тибетской медицины»`, `source` (`work: Чжуд-ши`, `part: Тантра
  объяснений`, `chapter: гл. 5–6`; attribute the popular paraphrase to `Сова Ригпа
  (manla.ru/base)`), `tags`. Body = `##`-delimited sections, **each ≤
  `TELEGRAM_LIMIT`**, in this order:
  1. *Intro (text before the first `##`)* — «Здоровье — это равновесие»: the
     premise that health is the dynamic balance of the three начала, and illness
     their excess / недостаток / возмущение.
  2. `## Пять первоэлементов` — пространство, ветер, огонь, вода, земля, and how
     each is said to manifest in the body (дыхание/движение, тепло/пищеварение,
     жидкости, плотные ткани, ум).
  3. `## Ветер (rLung)` — природа прохладно-нейтральная; шесть свойств; **пять
     видов** (Держатель жизни, Бегущий вверх, Проникающий, Равный огню, Очищающий
     вниз) с их областями и функциями.
  4. `## Желчь (Трипа)` — горячая природа; семь свойств; **пять видов**
     (Переваривающая, Цвет изменяющая, Претворяющая, Дающая зрение, Ясный цвет).
  5. `## Слизь (Бэкен)` — холодная природа; семь свойств; **пять видов**
     (Опора, Разлагающая, Вкусовая, Насыщающая, Соединяющая).
  6. `## Жар и Холод` — the disease-**nature** duality: what the tradition calls
     Жар vs Холод, the four источника Жара, the named виды Жара (распространённый,
     пустой, скрытый, застарелый, мутный) — **as taxonomy the corpus uses**, not
     as a diagnostic key.
  7. `## Конституция человека` — Ветер / Желчь / Слизь types and the common mixes;
     strictly **descriptive** ("традиция описывает…"), never "определите свой тип
     и делайте X".
  8. `## Принцип противоположного` — balancing a quality by its opposite; tie to
     the six вкусов (cross-reference, not duplicate, `tip-007-six-tastes`).
- **Deliverable 4b — two `manla.ru/info` guides** (`content/guides/tibetan/
  <id>.md` ×2): **seasonal eating & conduct** plus one of {daily conduct, water
  & drinks, incompatible foods}. Same frontmatter shape; `source` cites
  `Сова Ригпа (manla.ru/info)` + section in `chapter`.
- **Framing (all three):** **clinical, source-faithful register** for a
  practitioner audience (Plan 012 voice spec — named mechanisms, minimal hedging,
  no scare-quotes on technical terms), but **descriptive in stance throughout**
  (non-medical-advice invariant); manla prose **paraphrased**, attributed to the
  tradition (Rule 2);
  any prescriptive/diagnostic sub-topic reframed or dropped. The fundamentals
  guide is the highest-risk: it names disease and constitution categories, so it
  must read as *"how the tradition classifies"*, never as *"what to do about
  your condition"*. No dosing, no "if you have X then Y".
- Regenerate `content/.index/guides.json`.
- **Acceptance:** 3 guides load & validate; **`tib-osnovy` has its 7 `##`
  sections + intro**, each body ≤ `TELEGRAM_LIMIT`; spot-read confirms faithful,
  descriptive prose with no diagnostic framing; humor/term spellings match the
  combination corpus (Ветер, Желчь, Слизь, Жар, Холод); `content:index:check`
  green.

### Phase 5 — Validation, docs & close
*Owner: architect.*
- **Deliverables:**
  - Full gate run (typecheck, lint, test, build, content:index:check).
  - Refresh `docs/architecture/architecture.md` (new content type + module),
    `CLAUDE.md` (guides bucket; `splitForTelegram` as the sanctioned splitter;
    note message-splitting is no longer "deferred"); flip **ADR 008** References
    to point at this plan; record guide schema + manla citation convention in the
    content-curator refs.
  - Semver **minor** bump; `CHANGELOG.md`; move plan to `done/`.
- **Acceptance:** all gates green; docs reflect the new type; plan in `done/`.

## Risks / Open questions

- **First stateful navigation in the bot.** The pager is new territory —
  `callback_data` length, edit-vs-resend, and stale-session handling are the
  likely bug sources. Keep `callback_data` to `guideId:index`; reuse
  `session-store` rather than inventing state.
- **Section-overflow interaction with the pager.** A section that splits into N
  messages must keep the pager attached to exactly one (the last) and not orphan
  navigation. Covered in Phase 3 acceptance.
- **Non-medical-advice invariant.** manla's commercial, sometimes prescriptive
  prose is the main authoring risk; descriptive reframing + paraphrase are
  mandatory (same gate as Plan 005 Phase 3). **The fundamentals guide raises the
  bar:** the Жар/Холод and конституция sections describe *disease and body-type
  categories*. They must stay taxonomic ("традиция различает…", "Жаром называют…")
  and must never become a self-diagnosis or self-treatment key. This is the one
  guide most likely to drift prescriptive — review it hardest.
- **Two source surfaces now.** Phase 4 pulls from both `manla.ru/base/`
  (fundamentals) and `manla.ru/info/` (advice). Cite them distinctly in `source`
  so a reader/reviewer can trace each guide to its origin.
- **Authoring effort is real.** Paraphrasing a 3,000-word page faithfully is
  slow; this plan caps scope at 3 guides to validate the surface, not the
  catalogue.
- **manla citation string** — reuse Plan 005's agreed `Сова Ригпа (manla.ru)` so
  tips and guides cite consistently; confirm once.
- **`##`-as-section-delimiter** is a content convention; document it so authors
  don't nest deeper headings expecting separate pages.

## Verification

- `npm run typecheck && npm run lint && npm test && npm run build` — green.
- `npm run content:index && npm run content:index:check` — `guides.json` present,
  no drift, `counts.guides === 3`.
- Manual: `/guides` → list shows 3 titles → open «Основы тибетской медицины» →
  page ◀ ▶ through all 8 sections (intro → Принцип противоположного), indicator
  correct, no wrap at ends, disclaimer once on the last section, an overflowing
  section splits cleanly.
- Unit tests: `splitForTelegram` boundary/packing/pathological cases.

## Progress

- [x] Phase 1 — `Guide` type: types, loader, validate, index — `6222046`
- [x] Phase 2 — `splitForTelegram()` + render plumbing — `8f8b871`
- [x] Phase 3 — `/guides` browse + section pager — `ccf4e60`
- [x] Phase 4 — Author ≥3 guides: flagship «Основы тибетской медицины» (гл. 5–6) + «Питание и образ жизни по сезонам» (гл. 14) + «Распорядок дня» (гл. 13) — `be9522b`
- [ ] Phase 5 — Validation, docs & close

### Note (Phase 4) — sourcing & topic choices

- **Flagship** `tib-osnovy`: intro + the 7 spec'd sections, canon-faithful
  subtype names per `research/_private/fundamentals-canon-crosscheck.md`; source
  cites Чжуд-ши, Тантра объяснений, гл. 5–6 (manla.ru/base credited inline as the
  popular restatement). Жар/Холод and конституция kept strictly taxonomic.
- **Two shorter guides:** chose «Питание и образ жизни по сезонам» (the spec'd
  seasonal guide) and «Распорядок дня» (the "daily conduct" option, richer than
  incompatible-foods). Both cite **Чжуд-ши directly** (verified chapters гл. 14 /
  гл. 13 — the same the seasonal/conduct tips cite) instead of the plan's literal
  `Сова Ригпа (manla.ru/info)`, per honest-sourcing (the prose paraphrases those
  canon chapters). Flag for Phase 5 review if manla attribution is preferred.
- All sections ≤ `TELEGRAM_LIMIT` (max ~880 chars); `tib-osnovy` = intro + 7
  sections; disclaimer rides the final page at render time.

### Deviation (Phase 3) — approved by owner 2026-06-29

The plan (written 2026-06-26) specified a **standalone `/guides` command** with
its own **`SessionKind 'guide'`** and a separate drilldown. By the time of
implementation, **Plan 009** had consolidated `/browse`, `/search`, tips and
formulas into a single **Library hub** (`commands/library.ts`, one `'library'`
anchored session), and the hub already **reserved a guides slot**
(`messages.library.guides = '📖 Статьи'`). The owner chose to **fold guides into
the Library hub** instead:

- Guides are the `📖 Статьи` branch of the hub: screens `guide-list` /
  `guide-section`, callbacks `lib:guides` / `lib:glist` / `lib:guide` /
  `lib:gsec`, reusing the existing `'library'` session (**no new `SessionKind`**).
- A guide is page-flattened via `guidePages()` (sections → `splitForTelegram`
  pages); the pager `◀ N / M ▶` steps pages, `« Назад` returns to the list at its
  page, `🏠 В меню` to the hub. The render-time disclaimer (ADR 006) rides the
  final page.
- `/guides` opens the hub directly on the guide list (mirrors `/browse`), and is
  listed in `/help`.

This satisfies the plan's intent (a `/guides` surface, a section pager,
`splitForTelegram`-backed delivery, disclaimer once at the end) while staying
consistent with the post-Plan-009 navigation kit. Phase 5 (architect) should
reconcile ADR 008's "standalone command / `SessionKind 'guide'`" wording with
this hub-folded reality.
