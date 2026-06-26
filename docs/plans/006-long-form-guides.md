# Plan 006 — Long-form guides: content type, split delivery & browse

**Status:** Approved — not started
**Created:** 2026-06-26
**Approved:** 2026-06-26
**Bump on close:** minor (new user-facing content type + command)

## Context

The corpus has no home for **long-form reference articles** — multi-thousand-word
Sova-Rigpa pages such as the `https://manla.ru/info/` seasonal-eating section
(~3,000 words, table-structured). These are too big for a tip and are a category
error inside the herb/combination card model. The owner wants them surfaced as
"a list of helpful pages" the user pulls up and reads.

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
  - At least **3 authored guides** paraphrased from manla.ru/info to prove the
    end-to-end path (seasonal eating + two more), descriptively framed.
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
- **Deliverables:**
  - `content/guides/tibetan/<id>.md` ×3, paraphrased from manla.ru/info:
    **seasonal eating & conduct**, plus two of {daily conduct, water & drinks,
    incompatible foods}. Each: frontmatter (`id`, `tradition: tibetan`, `title`,
    `source` = `Сова Ригпа (manla.ru)` + section in `chapter`, `tags`) and a
    body of `##`-delimited sections, **each section ≤ `TELEGRAM_LIMIT`**.
  - **Descriptive framing throughout** (non-medical-advice invariant); manla
    prose **paraphrased**, attributed to the tradition (Rule 2); any prescriptive
    sub-topic reframed or dropped.
  - Regenerate `content/.index/guides.json`.
- **Acceptance:** 3 guides load & validate; section bodies within limit; spot-read
  confirms faithful, descriptive prose; `content:index:check` green.

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
  mandatory (same gate as Plan 005 Phase 3).
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
- Manual: `/guides` → list shows 3 titles → open seasonal guide → page ◀ ▶
  through all sections, indicator correct, no wrap at ends, disclaimer once on
  the last section, an overflowing section splits cleanly.
- Unit tests: `splitForTelegram` boundary/packing/pathological cases.

## Progress

- [ ] Phase 1 — `Guide` type: types, loader, validate, index
- [ ] Phase 2 — `splitForTelegram()` + render plumbing
- [ ] Phase 3 — `/guides` browse + section pager
- [ ] Phase 4 — Author ≥3 manla guides (descriptive)
- [ ] Phase 5 — Validation, docs & close
