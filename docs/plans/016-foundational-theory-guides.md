# Plan 016 — Foundational theory guides (tastes, disease causation, digestive fire, tissues)

**Status:** Approved — 2026-06-29 (owner; Wave 1 scope + citation locked). Authoring not started.
**Created:** 2026-06-29
**Approved:** 2026-06-29 — Wave 1 = {Шесть вкусов, Как возникает болезнь}; later waves deferred. Citation = book, Чжуд-ши named inline.
**Bump on close:** minor (new user-facing guides)

## Context

The guides surface (ADR 008, Plan 006) now carries four Tibetan guides:
`tib-osnovy` (theory hub), `tib-rasporyadok-dnya`, `tib-sezonnoe-pitanie`, and
the just-shipped `tib-sutochnyj-ritm` (daily cycle of the three начала, opened
with the literal cosmogenesis of Ветер). The owner wants to keep extending the
**foundational theory** layer, drawing — as before — **as literally from source
as possible**.

The approved backlog `docs/plans/006-guide-candidates.md` group **A (Foundations
& theory)** and group **B (how the tradition explains disease)** still hold the
unbuilt theory core. Two of those candidates are **already owned by Plan 013**
and are therefore **excluded here** (see *Boundaries* below):

- constitution portraits → **Plan 013 Phase 4** (`tib-tri-prirody`);
- rhythms & diagnosis → **Plan 013 Phase 5** (append to `tib-osnovy`).

What remains un-owned, and is both **foundational and quotable**, is the theory
backbone the corpus *uses but never explains*:

1. **Шесть вкусов** — `tib-osnovy` name-drops «шесть вкусов» twice and never
   unpacks them; every herb/formula card speaks in tastes & properties. The
   source (гл. 2 «О шести вкусах») gives the taste→element-pair→effect-on-начала
   system in full, near-tabular form. **Highest-value, highest-quotability.**
2. **Как возникает болезнь** — the descriptive mechanism (imbalance of the three
   начала, accumulated from food/conduct/season; the «виновник» model; «болезни
   возникают не извне, а из самого тела»). Pairs naturally with tastes (both turn
   on вкус → первоэлемент → начало).
3. **Пищеварительный огонь (ме-дро)** — three stages of digestion; why несварение
   is called the root of internal disease. Foundational physiology.
4. **Семь тканей тела и «чистый сок»** — how food is refined through seven tissues
   up to the vital essence (mdangs). Completes the «what food becomes» arc.

**Source.** Quotable primary source is the book **«Наука о здоровье. Сова Ригпа»**
(Ринчен Тензин, популярные лекции 2012–2013, сост. Т. Расторгуева, 2015) —
gitignored at `research/_private/nauka-zdorovye-text.txt`. The **Чжуд-ши** canon is
the cross-check. **Governance:** the copyrighted academic canon translation
(the PDF in `research/`) must **never be named in a tracked file**; citing the
work **«Чжуд-ши»** (Тантра объяснений, гл. N) is fine, as the existing guides do.

**Related:** ADR 008 / Plan 006 (Guide type, render-time disclaimer, Tibetan-only
scope) · Plan 012 voice spec (source-faithful clinical register) · Plan 013 (foods
+ constitutions + rhythms — adjacent, deduped below) · ADR 002 (renderer-agnostic)
· ADR 004 (guides pull-only, budget-exempt) · ADR 006 (render-time disclaimer) ·
the **non-medical-advice invariant** as clarified in Plan 006 (lifestyle & disease
*taxonomy* in-bounds; never "you have X → take Y"; no herb/formula dosing).

## Goals / Non-goals

- **Goals:**
  - Author **several** new foundational theory guides under
    `content/guides/tibetan/`, descriptive and source-cited, each `##`-split per
    ADR 008 with the disclaimer left to render time.
  - **Wave 1 (recommended):** «Шесть вкусов» → «Как возникает болезнь».
  - **Wave 2:** «Пищеварительный огонь» (after a source-availability check).
  - **Wave 3 (stretch):** «Семь тканей тела».
  - Cross-link the new guides into `tib-osnovy` and `tip-007-six-tastes` without
    duplication; regenerate the content index; minor bump; announcement queued.
- **Non-goals:**
  - **No constitution-portraits guide** — owned by Plan 013 Phase 4.
  - **No rhythms/diagnosis content** — owned by Plan 013 Phase 5 (and the daily
    cycle already shipped as `tib-sutochnyj-ritm`); this plan touches neither.
  - **No «Годичный цикл начал»** here — it belongs with the Plan 013 Phase 5
    reconciliation (overlaps `tib-sezonnoe-pitanie`); flagged, not built.
  - **No new content type, no bot-code change** — guides reuse the shipped Guide
    type + library hub pager. Authoring only.
  - **No TCM/Chinese guides** (ADR 008 Tibetan-only scope).
  - **No internet-sourced content** — book + Чжуд-ши only (web a silent
    cross-check, never cited), consistent with Plan 013.
  - **No dosing / no disease→remedy prescription** — theory & taxonomy only.

## Boundaries (dedup — read before authoring)

- **vs Plan 013 Phase 4 (constitutions):** excluded here entirely. If a tastes/
  disease guide must mention constitution, it links to the portraits guide, never
  re-describes the types.
- **vs Plan 013 Phase 5 + `tib-sutochnyj-ritm` (rhythms/diagnosis):** excluded
  here. **Flag for the architect/owner:** Plan 013 Phase 5 («Ритмы дня и года»
  appended to `tib-osnovy`) is **partly superseded** — the *daily* cycle now lives
  in the standalone `tib-sutochnyj-ritm`. Plan 013 Phase 5 should be revisited so
  only the **annual cycle** (deduped against `tib-sezonnoe-pitanie`) + **diagnosis**
  remain. Out of scope for *this* plan, but it should not be authored as written.
- **vs `tip-007-six-tastes`:** the tip is the short daily-push note; «Шесть вкусов»
  is the long reference. The guide **expands and the tip deep-links to it** (ADR 008
  tip→guide pattern); neither restates the other.
- **vs `tib-osnovy` sections:** osnovy keeps the **glossary-altitude** mentions
  («шесть вкусов», «Принцип противоположного», «Жар и Холод», the short
  «Конституция человека»); each new guide is the **deep dive** that osnovy links
  out to. Do not migrate osnovy content; cross-link it.

## Term reconciliation (applies to every guide)

The book's theory chapters say **Огонь** and **Земля-Вода**; the corpus and
`tib-osnovy` say **Желчь (Трипа)** and **Слизь (Бэкен)**. Author in the corpus
terms (Ветер / Желчь / Слизь) and **gloss the book's terms once per guide**
(«Желчь, в книге — Огонь»; «Слизь, в книге — Земля-Вода») so a reader bridging
from a formula card isn't lost. Same convention Plan 013 locked.

## Phases

Each phase is one authored guide (a coherent, independently-shippable slice).
Authoring owner: **content-curator**; framing review where flagged: **ux-telegram**
/ architect. **No phase ships dosing or a disease→remedy line.**

### Phase 1 — Guide «Шесть вкусов» (flagship)

- **Deliverables:** `content/guides/tibetan/tib-shest-vkusov.md`
  - **Frontmatter:** `id: tib-shest-vkusov`; `tradition: tibetan`;
    `title: «Шесть вкусов»`; `tags: [вкусы, первоэлементы, питание, три начала]`;
    `source:` → `work: "Наука о здоровье. Сова Ригпа"`,
    `part: "Ринчен Тензин, популярные лекции 2012–2013"`,
    `chapter: "гл. 2 «О шести вкусах»"`. *(Citation choice flagged in Risks.)*
  - **Section skeleton (`##`):**
    - *intro* — вкус как основа оценки пользы/вреда пищи и «силы и характера»
      действия лекарств; шесть вкусов рождены парами первоэлементов.
    - `## Шесть вкусов и первоэлементы` — the six with their element pairs:
      сладкий = земля-вода · кислый = огонь-земля · солёный = огонь-вода ·
      горький = ветер-вода · острый = огонь-ветер · вяжущий = ветер-земля.
    - `## Как вкусы действуют на начала` — per-taste nature (тёплый/прохладный,
      тяжёлый/лёгкий) + which начало each pacifies/aggravates: сладкий (прохл.,
      тяжёлый — вредит Слизи, помогает Огню и Ветру; мёд — исключение); кислый
      (тёплый — усугубляет Желчь, помогает Ветру, нейтрален к Слизи); солёный
      (тёплый — вреден при Жаре/Желчи, помогает Ветру при холоде); горький
      (прохладный — убавляет Жар, не подходит Ветру); острый (очень тёплый —
      усмиряет Слизь и холодное несварение, противопоказан при Жаре); вяжущий
      (слегка тяжёлый — помогает Слизи, может поднять Ветер).
    - `## Вкус и равновесие` — tie to the principle of opposites; how tastes are
      the lever that balances each начало; the bridge to herb/formula cards.
      Cross-link `tib-osnovy` («Принцип противоположного») and `tip-007`.
  - **Canon cross-check:** Чжуд-ши гл. 19 «Вкусы (первичные) и после
    переваривания» — confirm the six taste→element pairs and the «вкус после
    переваривания» note (post-digestive taste); fold a one-line mention only if it
    stays descriptive.
  - **Framing flag:** the source drifts into food-as-remedy asides (одуванчик
    fried-leaf recipe, чеснок «когда только начинаешь заболевать»). **Drop the
    recipes/remedy uses; keep the taste→начало mechanism.** Gloss Желчь≈Огонь,
    Слизь≈Земля-Вода once.
- **Acceptance:** loads & validates; ≤ `TELEGRAM_LIMIT` per section; six tastes +
  element pairs match the source; descriptive throughout, no dosing/recipe; pager
  walks it; cross-links resolve.

### Phase 2 — Guide «Как возникает болезнь»

- **Deliverables:** `content/guides/tibetan/tib-kak-voznikaet-bolezn.md`
  - **Frontmatter:** `id: tib-kak-voznikaet-bolezn`; `title: «Как возникает
    болезнь»`; `tags: [болезнь, равновесие, три начала, причина]`; `source:` →
    `work: "Наука о здоровье. Сова Ригпа"`, `part:` as above,
    `chapter: "гл. 1 «Как возникают болезни»"`.
  - **Section skeleton (`##`):**
    - *intro* — болезнь традиция выводит **изнутри**, не извне: из накопленного со
      временем дисбаланса трёх начал.
    - `## Три источника` — питание, образ жизни, смена сезонов; как повторяемое
      действие/пища усиливают один первоэлемент (много говорить → Ветер; тяжёлая
      земля-вода еда → Слизь/вес; острое/кислое → Огонь/Жар).
    - `## Дисбаланс трёх начал` — образ переполненной чаши; «три виновника»;
      традиционные 404 болезни; как определяют, какое начало в избытке.
    - `## Возвращение к равновесию` — descriptive: традиция выправляет баланс
      питанием и образом жизни (и, как добавляет традиция, лекарствами — сказано
      **описательно**, не как назначение читателю). Cross-link `tib-osnovy`
      («Принцип противоположного») и Phase 1.
  - **Canon cross-check:** Чжуд-ши гл. 8–9 (причина и условие — «семя и почва»):
    cause needs conditions to bear fruit. Use to frame `## Дисбаланс` if it
    sharpens the mechanism.
  - **Framing flag ⚠️ (review hardest):** this is the **highest quasi-medical**
    source section — it names опухоли/онкология/изжога and slides toward «определи
    виновника и лечи». **Keep the taxonomy/mechanism** («традиция объясняет
    болезнь как…»); **drop disease-specific claims and any reader-directed
    diagnose-and-treat framing.** No "если у вас X".
- **Acceptance:** as Phase 1, plus an explicit non-medical-advice read: no
  disease→remedy, no self-diagnosis key; the «виновник» model reads as the
  tradition's classification, not a clinical instruction.

### Phase 3 — Guide «Пищеварительный огонь (ме-дро)» (Wave 2)

- **Pre-step (source-availability check):** before authoring, confirm there is
  enough **quotable** material — the book treats digestion *scattered* across
  гл. 2 «О питании в целом» and гл. 4, with no dedicated heading, so this guide
  leans more on **Чжуд-ши гл. 16 paraphrase** than Phases 1–2. If the source
  proves thin, **fold the essentials into `tib-osnovy` (a `## Пищеварительный
  огонь` section) instead of a standalone guide** and close this phase as merged.
- **Deliverables (if standalone):**
  `content/guides/tibetan/tib-pishchevaritelnyj-ogon.md`
  - **Frontmatter:** `id: tib-pishchevaritelnyj-ogon`;
    `title: «Пищеварительный огонь»`; `tags: [пищеварение, огонь, желчь, питание]`;
    `source:` → `work: "Чжуд-ши"`, `part: "Тантра объяснений"`,
    `chapter: "гл. 16"` (primary canon-paraphrase; book as silent cross-check).
  - **Section skeleton (`##`):** *intro* (ме-дро = пищеварительное тепло, седалище
    Желчи переваривающей — link to osnovy's five-Желчь subtypes) · `## Три стадии
    переваривания` (по вкусам: сладкая → кислая → горькая фаза, «вкус после
    переваривания») · `## Сильный и слабый огонь` (почему несварение зовут корнем
    внутренних болезней) · `## Что поддерживает огонь` (тёплая пища, своевременность,
    мера — lifestyle, descriptive; **no dosing**).
- **Acceptance:** as Phase 1; **or** the merged-into-osnovy outcome with osnovy
  still ≤ limit per section and the pager clean.

### Phase 4 — Guide «Семь тканей тела и „чистый сок"» (Wave 3, stretch)

- **Deliverables:** `content/guides/tibetan/tib-sem-tkanej.md`
  - **Frontmatter:** `id: tib-sem-tkanej`; `title: «Семь тканей тела»`;
    `tags: [ткани, питание, эссенция, тело]`; `source:` → `work: "Чжуд-ши"`,
    `part: "Тантра объяснений"`, `chapter: "гл. 5"` (canon-paraphrase; **lowest
    quotability** — flag).
  - **Section skeleton (`##`):** *intro* (как пища претворяется в тело) ·
    `## Семь тканей` (питательный сок → кровь → мышцы → жир → кость → костный мозг
    → семя/репродуктивная эссенция) · `## Чистое и мутное` (на каждой ступени —
    чистая часть и осадок) · `## Жизненная эссенция (mdangs)` («чистый сок»/«цвет»
    как итог претворения).
- **Acceptance:** as Phase 1. **Lowest priority** — author only if the canon
  paraphrase reads faithfully and adds beyond osnovy; otherwise defer to backlog.

### Phase 5 — Cross-links, index regen, docs & close

- **Deliverables:**
  - Wire the cross-links: `tip-007-six-tastes` deep-links «Шесть вкусов»; the new
    guides reference `tib-osnovy` (and each other where natural).
  - `npm run content:index`; `content:index:check` green; `counts.guides`
    reflects the wave.
  - Refresh `CLAUDE.md` / `docs/architecture/architecture.md` only if the guide
    inventory note needs it; tick the corresponding rows in
    `006-guide-candidates.md`.
  - Full gate run; **minor** bump; `CHANGELOG.md`; one `versionAnnouncements`
    entry (plain Russian, e.g. «Добавили статьи о шести вкусах и о том, как
    традиция объясняет болезнь»); move plan to `done/`.
- **Acceptance:** all gates green; the new guides browsable via `/guides`; index
  in sync; announcement queued; non-medical-advice read passed on every guide.

## Risks / Open questions

- **Plan 013 reconciliation (must resolve before Plan 013 Phase 5 is authored):**
  the daily cycle shipped standalone as `tib-sutochnyj-ritm`, so Plan 013 Phase 5
  «Ритмы дня и года → tib-osnovy» is partly superseded. Recommend Plan 013 Phase 5
  be narrowed to **annual cycle (deduped vs `tib-sezonnoe-pitanie`) + diagnosis**.
  Tracked here as a flag; not fixed by this plan.
- **Source-citation choice — DECIDED (owner, 2026-06-29).** Cite the source
  actually quoted, the **book** «Наука о здоровье. Сова Ригпа» (in `source:`),
  and **name the Чжуд-ши chapter inline** in the body as a cross-check —
  consistent with `tib-sutochnyj-ritm`. Frontmatter in Phases 1–2 already
  reflects this.
- **Quasi-medical drift (Phase 2 ⚠️, Phase 1 minor).** The disease-causation
  chapter is the riskiest source text in the book; the tastes chapter has
  food-remedy asides. The guard holds only if the author drops every
  disease→remedy line and keeps taxonomy/mechanism. Review Phase 2 hardest.
- **Term reconciliation** (Огонь/Земля-Вода vs Желчь/Слизь) — gloss once per guide
  or a card-bridging reader is lost.
- **Phase 3 quotability** — may merge into osnovy rather than stand alone; the
  pre-step decides. Phase 4 is genuinely optional.
- **Owner read vs my read (flagged per request):**
  - The session shortlist's **«Три конституции»** is **dropped** — Plan 013
    Phase 4 already owns it.
  - The shortlist's **«Что такое Сова Ригпа / диагностика»** is **not** in this
    wave — its diagnosis half overlaps Plan 013 Phase 5, and the «истоки/разделы»
    half is meta-framing, less foundational; deferred to backlog.
  - **«Как возникает болезнь»** is promoted into **Wave 1** (the owner had it
    lower) because it's highly quotable and pairs tightly with «Шесть вкусов».

## Verification

- `npm run content:index && npm run content:index:check` — `counts.guides` up, no
  drift; each new guide present in `content/.index/guides.json` with the right
  `sectionCount` and `source`.
- Boot/load: each guide parses; malformed frontmatter fails with a file-pathed
  error.
- Manual: `/guides` lists the new titles; page ◀ ▶ through each; the disclaimer
  rides the final page once; cross-links read sensibly.
- **Non-medical-advice read** on every guide: no disease→remedy, no dosing, no
  reader-directed self-diagnosis — especially Phase 2.

## Progress

- [ ] Phase 1 — Guide «Шесть вкусов» (flagship)
- [ ] Phase 2 — Guide «Как возникает болезнь» (⚠️ framing review)
- [ ] Phase 3 — Guide «Пищеварительный огонь» (Wave 2; may merge into osnovy)
- [ ] Phase 4 — Guide «Семь тканей тела» (Wave 3; stretch/optional)
- [ ] Phase 5 — Cross-links, index regen, docs & close
