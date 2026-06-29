# ADR 013 — User-facing surface is Tibetan-only (Chinese deferred behind a visibility gate)

**Date:** 2026-06-29
**Status:** Accepted (2026-06-29, Plan 015)

## Context

The bot was framed from day one as a reference on **Chinese (TCM) and Tibetan**
traditional medicine (CLAUDE.md, architect Project Context, the `/start` and
`/help` copy). In practice the corpus is overwhelmingly Tibetan:

- **149 / 149** combinations are `tradition: tibetan`.
- **All** guides are Tibetan (ADR 008 scope note, 2026-06-29).
- Of **3** herbs, only **1** is Tibetan (`tib-haritaki`); the other two
  (`tcm-astragalus`, `tcm-ginger`) are Chinese **seed stubs** with thin sourcing.

The owner wants the Chinese material **hidden from users now** — "too little, and
no sources" — and **addable later** ("maybe it will be added later"). The
preference is explicit: **hide, do not delete**. This mirrors the guides
Tibetan-only scope decision (ADR 008) and extends it to the herb surface and the
navigation that exposes tradition.

Forces:

- **No leak tolerance.** Chinese herbs reach users through *several* paths, not
  one button: the 🇨🇳 tradition picker, **category** lists (a category can mix
  traditions), **search**, the herb **card**, and **cross-links** from formulas.
  A per-surface edit would leave leak paths (e.g. a stale `br:herb:tcm-ginger`
  tap, or a search hit). The codebase already prefers a **single compile-time
  chokepoint** for exactly this reason — see `_formula-gate.ts`
  (`FORMULA_BRANCH_ENABLED`), where handlers are only registered when the gate is
  on so a hand-crafted tap can't leak.
- **Reversibility.** Re-enabling Chinese should be a one-line flip, with the
  authored files and committed content index intact.
- **Portability (ADR 003).** The filter must stay framework-free — it belongs in
  `src/content/`, not the bot layer.

## Decision

**Gate the Chinese tradition out of the runtime corpus at a single content-load
chokepoint, and remove the now-degenerate tradition navigation. Keep the files,
the index, and the `Tradition` type.**

1. **Visibility gate.** Add a pure, framework-free module
   `src/content/visibility.ts` exporting `VISIBLE_TRADITIONS` (currently
   `['tibetan']` — Chinese omitted) and `isVisibleTradition(t)`. This is a
   **compile-time constant**, not an env/runtime flag — same shape as
   `FORMULA_BRANCH_ENABLED`.

2. **Filter at `loadContent` (single chokepoint).** Drop any tradition-bearing
   item whose `tradition` ∉ `VISIBLE_TRADITIONS` **before** buckets, cross-links,
   and `validateCorpus` are built. Because no combination references the Chinese
   herbs (verified) and all combinations/guides are Tibetan, this removes only
   the two Chinese herbs and orphans nothing. Downstream — browse lists, category
   counts, search, herb cards, cross-links — excludes Chinese **by
   construction**, with zero per-surface edits and no leak path.

3. **Files and index untouched.** `content/herbs/chinese/*.md` and their entries
   in the committed `content/.index/herbs.json` **stay**. The index is a
   full-corpus build artifact for tooling/CI; runtime *visibility* is a separate
   concern. Because the index builder shares `loadContent` (which now applies the
   gate), it loads with `loadContent(dir, { includeHiddenTraditions: true })` —
   opting **out** of the gate so the committed index keeps every authored record.
   `content:index:check` keeps passing (files and index still agree). Re-enabling
   Chinese = add `'chinese'` back to `VISIBLE_TRADITIONS`.

4. **Navigation collapses to one tradition.** With a single visible tradition the
   "По традиции" axis is meaningless. The Herbs sub-menu drops the tradition
   picker (`traditionPickView`, the `lib:bytrad` / `lib:tr:*` handlers, and the
   `messages.browse.chinese` button) in favour of a flat **"Все травы"** list of
   all visible herbs, keeping **"По категории"**. (Exact menu shape fixed in the
   implementation plan.)

5. **Wording.** `/start` and `/help` drop "китайской" — the bot presents as a
   **Tibetan**-medicine reference.

6. **Data model unchanged.** Herbs and combinations still carry `tradition`, and
   the `Tradition = 'chinese' | 'tibetan'` type is **left intact** (consistent
   with the ADR 008 scope note) so re-enabling needs no type churn.

## Consequences

- The entire user-facing surface is Tibetan; the tradition concept effectively
  disappears from the UI while the domain model keeps it.
- The herb library shrinks to the **one** visible Tibetan herb until more Tibetan
  herbs are authored — surfaced honestly (empty categories drop out via the
  existing `count > 0` filter), not faked.
- **CLAUDE.md** and the **architect Project Context** "Chinese (TCM) and Tibetan"
  framing must be amended to: corpus/UI is **Tibetan-only**; Chinese is
  **authored-but-gated**, deferred.
- A future Chinese re-enable is a one-line constant change plus restoring the
  tradition picker — both reversible by design.

## Alternatives considered

- **Delete the Chinese herb files.** Rejected: the owner wants a reversible hide;
  deletion discards seed work and forces re-authoring later.
- **UI-only filtering at each call site** (hide the button, filter search, filter
  category counts). Rejected: multiple chokepoints, real leak risk (stale
  `br:herb:*` taps, search) — the load-time filter closes every path at once,
  matching the formula-gate rationale.
- **Narrow/drop the `Tradition` type.** Rejected: herbs and combinations still
  model tradition; narrowing now is churn to re-widen later. ADR 008 already
  chose to keep the shared type.

## References

- ADR 008 (guides Tibetan-only scope note, 2026-06-29) — this ADR extends that
  decision to the herb surface and navigation.
- `src/bot/commands/_formula-gate.ts` (`FORMULA_BRANCH_ENABLED`) — single
  compile-time gate precedent.
- ADR 003 (portability — the filter stays in `src/content/`, framework-free).
- Implementation: **Plan 015 (hide the Chinese tradition)**.
