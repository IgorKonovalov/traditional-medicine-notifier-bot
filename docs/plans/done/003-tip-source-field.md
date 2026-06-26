# Plan 003 — Structured `source` field for daily tips

**Status:** Completed
**Created:** 2026-06-26
**Completed:** 2026-06-26
**Bump on close:** minor

## Context

We just authored 10 daily tips (`content/tips/tip-001..tip-010`) paraphrased
from the «Чжуд-ши» (Four Tantras), Тантра объяснений. To make them more
credible, each currently ends with a hand-written body-line citation, e.g.:

```
_Источник: «Чжуд-ши», Тантра объяснений, гл. 18 «Мера питания»._
```

Baking the citation into the prose body is the same anti-pattern ADR 006 moved
away from for the herb disclaimer: rendering concerns living inside content
markdown. We want the citation as **structured frontmatter** so it is queryable
(index), separable from prose, and formatted **once** by the bot at render time
— consistent with ADR 002 (renderer-agnostic content) and ADR 006 (disclaimer
appended at render time, not stored in the body).

This is a small, low-risk, additive change. The field is **optional**, so tips
without a source (and all other content) keep validating unchanged.

## Goals / Non-goals

- **Goals:**
  - Add an optional structured `source` to the `Tip` type.
  - Loader parses/validates it; malformed shape fails boot (fail-fast).
  - Bot appends a formatted `Источник:` line to the daily tip **at render time**.
  - Migrate the 10 existing tips: lift the citation into frontmatter, strip the
    body line.
- **Non-goals:**
  - No `source` on herbs/combinations/categories (combinations already have
    `sources: string[]` URLs — out of scope, different shape and purpose).
  - No new UI/command, no per-source filtering feature yet (index projection is
    groundwork only).
  - No change to the daily-tip selection/rotation or the proactive budget gate.

## Recommended shape

A **small structured object**, not a freeform string — it is the whole point of
the request (queryable, consistently rendered):

```yaml
source:
  work: Чжуд-ши            # required within the block
  part: Тантра объяснений  # optional
  chapter: гл. 18 «Мера питания»  # optional
```

```ts
export interface TipSource {
  readonly work: string;       // required
  readonly part?: string;      // optional
  readonly chapter?: string;   // optional
}
export interface Tip {
  readonly id: string;
  readonly category?: string;
  readonly source?: TipSource; // optional
  readonly body: string;
}
```

Rationale: structured beats a single string because the renderer can format the
`Источник:` line uniformly and a future "tips from «Чжуд-ши»" filter needs the
`work` discretely. Kept to three fields to avoid over-engineering; `work` is the
only required key inside the block.

## Phases

### Phase 1 — Schema + loader/validation
- **Deliverables:**
  - `src/content/types.ts`: add `TipSource` interface and optional `source` on `Tip`.
  - `src/content/loader.ts`: add a `parseTipSource` coercion helper (object with
    required-string `work`, optional-string `part`/`chapter`; reject non-object,
    missing `work`, or non-string members with a file-pathed error). Wire it into
    `parseTip` via the existing spread-when-present pattern.
  - No change needed in `validate.ts` unless we want cross-checks (none required;
    `source` references nothing else).
- **Acceptance:** `npm run typecheck` clean; a tip with a well-formed `source`
  loads; a malformed `source` (missing `work`, wrong types) throws at load with
  the file path; tips without `source` still load.

### Phase 2 — Index projection
- **Deliverables:**
  - `src/content/index-builders.ts`: add optional `source` to `TipIndexEntry`,
    projected when present (spread-when-defined, mirroring `category`).
  - Regenerate `content/.index/tips.json`.
- **Acceptance:** `npm run content:index` writes `source` into entries that have
  it; `npm run content:index:check` passes (no drift).
- **Recommendation: yes, project it.** It is the queryability half of the goal
  and costs ~3 lines; the index is the sanctioned place for corpus-wide lookups.

### Phase 3 — Render at send time
- **Deliverables:**
  - `src/bot/messages.ts`: extend `tip.daily` to accept an optional formatted
    source string and append it as a trailing `Источник: …` line (single source
    of formatting), or add a small `tip.source(src)` formatter — dev's choice,
    keep all Russian strings in `messages.ts` per CLAUDE.md.
  - `src/index.ts` `selectTip`: pass `tip.source` through to the message builder.
  - Keep the body clamp in mind: format so the source line is appended **after**
    `toPlainText(body)`, analogous to how `herb.ts` appends the disclaimer after
    a clamp so it is never truncated away.
- **Acceptance:** a rendered daily tip shows `🌿 Совет дня`, the body, then the
  `Источник:` line; a tip without `source` renders with no trailing line and no
  stray blank lines.

### Phase 4 — Migrate the 10 tips
- **Deliverables:**
  - For each `tip-001..tip-010`, add the `source` block and delete the
    `_Источник: …_` body line. Mapping is already known and mechanical:

    | tip | chapter |
    |---|---|
    | 001 warm-foods | гл. 14 «Сезонный образ жизни» |
    | 002 rhythm | гл. 13 «Повседневный образ жизни» |
    | 003 seasonal-eating | гл. 14 «Сезонный образ жизни» |
    | 004 seasonal-qualities | гл. 14 «Сезонный образ жизни» |
    | 005 measure | гл. 18 «Мера питания» |
    | 006 light/heavy | гл. 16 «О том, как надо питаться» |
    | 007 six-tastes | гл. 19 «Вкусы» |
    | 008 warm-water | гл. 16 «О том, как надо питаться» |
    | 009 natural-urges | гл. 15 «Как вести себя в частных случаях» |
    | 010 conditions | гл. 23 «Как жить не болея» |

    (`work: Чжуд-ши`, `part: Тантра объяснений` are constant across all 10.)
  - Regenerate the index.
- **Acceptance:** `content:index:check` passes; no tip body contains `Источник:`;
  ids and `digestive-herbs` category assignments unchanged (no join breakage).

## Risks / Open questions

- **Disclaimer interaction:** the daily tip does **not** currently append
  `messages.disclaimer` (unlike herb pages). This plan does not change that.
  Open question for the owner: should the proactive tip also carry the standard
  disclaimer? If yes, that is a separate small follow-up, not folded in here.
- **ADR touch:** no ADR decision is invalidated. This change *reinforces* ADR 002
  (renderer-agnostic content) and follows the ADR 006 render-time pattern, so a
  one-line note in ADR 002's consequences is sufficient — **no new ADR needed**.
- **Telegram length:** the source line is short; appended after the body it stays
  within the ~3800-char budget. Keep the append outside any clamp on the body.

## Verification

- `npm run typecheck && npm run lint && npm test && npm run content:index:check`.
- Unit-level: render a tip with and without `source`; assert the trailing line
  appears/!appears and formatting matches.
- Manual: trigger `runDailyTipTick` against a test notifier; confirm the pushed
  message ends with the `Источник:` line.

## Progress

Implemented; staged and uncommitted, pending review. Gates green:
`typecheck`, `lint`, `test` (28 passing), `content:index:check`.

- [x] Phase 1 — schema + loader/validation (`TipSource` + `parseTipSource`)
- [x] Phase 2 — index projection (`TipIndexEntry.source`)
- [x] Phase 3 — render at send time (`messages.tip.daily` + `selectTip`)
- [x] Phase 4 — migrate 10 tips + reindex
