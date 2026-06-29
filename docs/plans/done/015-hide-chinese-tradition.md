# Plan 015 — Hide the Chinese tradition (Tibetan-only user surface)

**Status:** Completed — 2026-06-29 (v0.16.0)
**Created:** 2026-06-29
**Completed:** 2026-06-29 — commits `6a239d0` (feat), `2c02b7e` (release)
**Decision record:** ADR 013 (Tibetan-only user surface) — Accepted
**Bump on close:** minor (user-facing: navigation + copy change, corpus surface shrinks)

## Close note (architect review, 2026-06-29)

All four phases delivered; gate green (typecheck, lint, 218 tests, build,
`content:index:check`). Verified: boot load `herbs.all = ['tib-haritaki']`, no
`tcm-*` key, 149 combos intact; no user-facing string mentions китайск* (the one
`китайск` hit in `_formula-card.ts` is an ingredient name-label abbreviation
«Кит.», unrelated to the tradition axis — correctly untouched).

**Accepted deviation:** the plan's "Index drift: None" risk note was wrong — the
index builder runs through `loadContent`, so the filter would have stripped the
Chinese herbs from the regenerated index, violating the "index entries stay"
non-goal. Resolved by adding an `includeHiddenTraditions` opt-out to `loadContent`
that the index builder sets — the runtime stays gated, the committed index keeps
the full corpus. Correct call; ADR 013 point 3 updated to record it. The
signature change is minimal and consistent with the ADR's stated consequence.

## Goal

Hide the Chinese (TCM) tradition from the entire **user-facing** surface — keyboard
navigation, herb lists, search, cards — while keeping the authored Chinese herb
files and the committed content index intact. Reversible via one constant. See
ADR 013 for the rationale and the single-chokepoint design.

## Non-goals

- **No content deletion.** `content/herbs/chinese/*.md` and their index entries stay.
- **No `Tradition` type change.** Herbs/combinations keep `tradition`; the type
  keeps `'chinese' | 'tibetan'`.
- **No formula/guide changes.** All 149 formulas and all guides are already
  Tibetan; nothing to gate there.

## Phases

### Phase 1 — Visibility gate + content-load filter

- Add `src/content/visibility.ts`: `VISIBLE_TRADITIONS = ['tibetan'] as const`
  and `isVisibleTradition(t: Tradition): boolean`. Pure, framework-free (ADR 003).
- In `src/content/loader.ts → loadContent`, filter parsed **herbs** (and,
  defensively, **combinations**) by `isVisibleTradition` **before** `toBucket`,
  `buildCrossLinks`, and `validateCorpus` run. Net effect today: the two Chinese
  herbs are dropped; nothing else changes (no combo references them — verified).
- **Deliverable check:** boot-loaded `content.herbs.all` has length 1
  (`tib-haritaki`); `content.herbs.byId` has no `tcm-*` key; `validateCorpus`
  passes; `crossLinks` unaffected.

### Phase 2 — Navigation (remove the tradition axis)

- In `src/bot/commands/library.ts`: with one visible tradition, replace the Herbs
  sub-menu's **"По традиции"** entry with a flat **"Все травы"** list (all visible
  herbs); keep **"По категории"**. Remove `traditionPickView` and the
  `lib:bytrad` / `lib:tr:(chinese|tibetan)` handlers + the `'pick-tradition'`
  screen/back-state (or repoint the existing tibetan-list path to the new
  "Все травы" screen — dev's call, keep `herbsFor` logic).
- Drop the now-unused `messages.browse.chinese`, `messages.library.byTradition`,
  `messages.library.pickTradition` (or keep `tibetan`/label helper if still
  referenced by the herb card's `tradition()` tag).
- **Deliverable check:** no reachable path renders a 🇨🇳 button or a Chinese herb;
  `library.test.ts` updated (the `pick-tradition` `backState` case goes away).

### Phase 3 — Copy

- `src/bot/messages.ts` `/start` + `/help`: "справочник по китайской и тибетской
  традиционной медицине" → "справочник по тибетской традиционной медицине"
  (both occurrences, lines ~63 and ~69).
- **Deliverable check:** no user-facing string mentions китайск*.

### Phase 4 — Docs (in the close commit)

- Flip ADR 013 `Status: Proposed → Accepted`.
- Amend **CLAUDE.md** and the **architect Project Context**: corpus/UI is
  **Tibetan-only**; Chinese is authored-but-gated (point at ADR 013).
- CHANGELOG + version bump + `versionAnnouncements` entry per the architect close
  ritual (minor).

## Risks / notes

- **Herb library becomes one herb.** Expected and surfaced honestly — `tonic-herbs`
  (astragalus-only) drops out via the existing `count > 0` category filter;
  `digestive-herbs` keeps haritaki. Not a bug.
- **Index drift.** None — the filter is runtime-only; `content:index` still emits
  all three herbs and `content:index:check` stays green.
- **Re-enable path.** Add `'chinese'` to `VISIBLE_TRADITIONS` and restore the
  tradition picker; no data or type work.
- **⚠️ Positioning caveat for future sessions.** After this lands the bot is
  **Tibetan-only by deliberate choice** — *not* because Chinese was never built.
  The `Tradition` type still reads `'chinese' | 'tibetan'` and the Chinese herb
  files still sit in `content/herbs/chinese/`, so a later session may "helpfully"
  re-surface Chinese thinking it's an oversight. **It is not.** Chinese is gated
  off intentionally (ADR 013, ADR 008); do not re-expose it without an explicit
  owner request to lift the gate.

## Resolved decisions

**Phase 2 menu shape (owner-confirmed 2026-06-29):** Herbs →
**[Все травы] [По категории]**. The flat «Все травы» list (all visible herbs)
replaces the tradition picker; «По категории» stays.
