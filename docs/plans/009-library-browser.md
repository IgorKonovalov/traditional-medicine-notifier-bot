# Plan 009 — Library browser (herbs, cross-links, gated formulas)

**Status:** Approved — not started
**Created:** 2026-06-26
**Approved:** 2026-06-26
**Bump on close:** minor (reworked, discoverable library surface)
**Depends on:** Plan 007 (navigation shell). Coordinates with Plan 005 (tips) and
Plan 006 (guides) for the library's sibling branches.

> **Amendment (2026-06-28) — no runtime flag.** This plan originally gated the
> combinations browser behind a `FEATURE_COMBINATIONS_BROWSER` config flag (added
> in Plan 007). That flag was **removed** by owner decision: the bot is private
> and pre-launch, so there is no staging/production split to toggle. The
> **ADR 006 doctor-gate still holds** — the combinations browser is built **last
> and simply not registered** into the library hub (no `🧪 Формулы` branch, no
> formula search hits, no herb→formula cross-links) until the owner's documented
> medical sign-off. Throughout this plan, read "behind the flag / flag on" as
> "**once the formula branch is registered (post sign-off)**" and "flag off" as
> "**withheld by default**". Mechanism changed; the gate did not.

## Context

The corpus is rich but barely reachable. `/browse` only walks
tradition → herb list → herb card; `/search` is a bare substring match printed as
a flat list. The **large Tibetan-formula corpus** (combinations, ADR 005) is
**completely invisible** in the UI, and the herb↔formula relationship
(`combinations[].members` cross-links to herb ids) is unused. There is no single
"library" home tying herbs, formulas, categories, guides and tips together.

This plan builds a unified **`📚 Библиотека`** surface on the navigation shell
(Plan 007): a hub → browse-by-tradition / by-category / search → **rich item
cards** with cross-links, plus a **combinations browser that is built but
withheld** — not registered into the hub until the owner's documented medical
sign-off (ADR 006 doctor-gate; see the amendment above — no runtime flag). The
combinations corpus is non-sanitised staging data and **must not reach users**
until that sign-off; building the branch last and leaving it unregistered keeps
it reviewable without exposing it.

**Related:** consumes **ADR 009** / **Plan 007**; respects **ADR 002**
(renderer-agnostic bodies), **ADR 005** (combinations type), **ADR 006**
(doctor-gate + render-time disclaimer). The library hub also hosts entry points
to **guides** (Plan 006) and **tips browse** (Plan 005) so all reference content
lives under one roof.

## Goals / Non-goals

- **Goals:**
  - A `📚 Библиотека` hub: `🌿 Травы`, `📖 Статьи` (guides, if present),
    `💡 Советы` (tips browse), `🔎 Поиск`, and — **only when the flag is on** —
    `🧪 Формулы` (combinations).
  - Browse herbs by **tradition** and by **category**, anchor-edited with
    back/home and pagination for long lists.
  - **Rich herb card:** properties/uses/cautions (descriptive framing), the
    render-time disclaimer (ADR 006), the `⏰ Напомнить` entry (Plan 008), and a
    **"входит в формулы"** cross-link section listing formulas whose `members`
    include this herb (reverse index) — links resolve only when the formula
    branch is enabled.
  - **Search integrated into the library:** results render as a tappable list
    into the anchor → item card → back to results (replaces the flat `/search`
    print). Searches herbs always; includes formulas only when the flag is on.
  - **Combinations browser (withheld):** list/search formulas → formula card
    (`composition`, `members` cross-links back to herbs, descriptive framing,
    disclaimer). Built but not registered into the hub until medical sign-off
    (no runtime flag — see the amendment above).
- **Non-goals:**
  - No sanitisation or re-authoring of combinations content (ADR 006 / Plan 004
    own that); this is **surface only**, gated.
  - No new content types and no guides/tips internals (Plans 006/005 own those —
    this plan only links to their entry points).
  - No full-text/ranked search engine — keep the in-memory substring match,
    improved presentation only.
  - No per-herb media/images.

## Phases

### Phase 1 — Reverse cross-link index (herb ↔ formulas)
*Owner: dev.*
- **Deliverables:**
  - `src/content/index-builders.ts`: build a `herbId → formulaId[]` reverse map
    from `combinations[].members` (and expose formula → member-herb the forward
    way). Surface it on the loaded-content/index API the bot reads (e.g.
    `content.crossLinks.formulasByHerb.get(herbId)`).
  - Keep it in the committed `content/.index/` projection if cheap, or compute at
    boot; ensure `content:index:check` covers any new generated file.
  - Unit test: a known herb resolves to the expected formula ids; unknown herb →
    empty.
- **Acceptance:** reverse lookup correct for a sampled herb; index drift guard
  green; no change to content files.

### Phase 2 — Library hub + herb browse (anchor + back/home + pager)
*Owner: dev (with ux-telegram review).*
- **Deliverables:**
  - `src/bot/commands/library.ts`: the `📚 Библиотека` hub (menu entry from Plan
    007 now points here). Branches: `🌿 Травы` (→ by tradition / by category),
    `📖 Статьи` and `💡 Советы` (link to Plan 006 / Plan 005 entries if present,
    else hidden), `🔎 Поиск`. `🧪 Формулы` rendered **only once the combinations
    branch is registered** (post sign-off; omitted until then).
  - Herb browse: tradition picker → (optional category filter) → paginated herb
    list → herb card, all editing one anchor with `« Назад`/home; reuse Plan 007's
    `pager`.
  - `SessionKind 'library'` state `{ branch, tradition?, category?, page,
    itemId? }`.
- **Acceptance:** hub shows only enabled branches; herb browse paginates and
  navigates back without wrap; one message per session; gated branch absent when
  flag off.

### Phase 3 — Rich herb card with cross-links
*Owner: dev (with ux-telegram review).*
- **Deliverables:**
  - `src/bot/commands/herb.ts` (or a `library.card.ts`): herb card renders
    name(s), properties, uses, cautions (descriptive), the render-time disclaimer
    (ADR 006), `⏰ Напомнить` (Plan 008), and a **"Входит в формулы"** section
    listing reverse-linked formulas. Each formula link opens the formula card
    **only if** the flag is on; when off, the section is omitted (no dead links).
  - Back returns to the originating list (tradition or category or search).
- **Acceptance:** card shows cross-links when the flag is on and hides the section
  cleanly when off; disclaimer present; `⏰ Напомнить` reaches the wizard; back
  target correct from each entry path.

### Phase 4 — Search integrated into the library
*Owner: dev.*
- **Deliverables:**
  - Move the substring search behind the library `🔎 Поиск` branch: prompt → query
    (claimed `on('text')` while a search session is active, per Plan 007/008
    pattern) → results list into the anchor → item card → `« Назад` to results.
  - Search herbs always; include formulas in the haystack **only when the flag is
    on**. Keep the existing case-insensitive RU/Latin/Pinyin match.
  - `/search <query>` keeps working as a shortcut that lands in the same results
    view.
- **Acceptance:** query returns a tappable list; opening/closing a result returns
  to results; formula hits appear only with the flag on; `/search foo` shortcut
  works.

### Phase 5 — Combinations browser (withheld) + validation, docs & close
*Owner: dev for the browser; architect for close.*
- **Deliverables:**
  - `🧪 Формулы` branch (unregistered until sign-off): browse/search formulas → formula card
    rendering `name`(s), `composition`, `members` cross-links **back to herb
    cards**, descriptive framing, render-time disclaimer. **No** indications/
    dosing surfaced beyond what the doctor-gate permits — keep to
    composition/membership + descriptive note; the verbose non-sanitised fields
    stay unsurfaced pending Plan 004 / ADR 006 sign-off. (Confirm the exact
    surfaced field set with the owner — see Open questions.)
  - Confirm safety: by default (branch unregistered) there is no formula branch,
    no formula search hits, no cross-link section — verified by a test that
    asserts the combinations surface is absent unless explicitly registered.
  - Full gate run (typecheck, lint, test, build, content:index:check).
  - Refresh `docs/architecture/architecture.md` (library surface; reverse index;
    withheld combinations UI), `CLAUDE.md` (how the combinations branch is held
    back), and add a line to `docs/medical-review.md` that the UI surface stays
    withheld until sign-off.
  - Semver **minor** bump; `CHANGELOG.md`; move plan to `done/`.
- **Acceptance:** when the formula branch is registered the browser works and
  cross-links round-trip herb↔formula; by default the branch is fully absent
  (asserted by test); all gates green; plan in `done/`.

## Risks / Open questions

- **ADR 006 doctor-gate is the central constraint.** The formula browser must be
  provably absent until sign-off. Mitigation: don't register the branch — a
  single registration point (hub-builder + search-haystack + cross-link section
  all guarded by one "formula branch enabled" predicate, default false), plus a
  test asserting absence by default. Any leak is a release blocker.
- **Which formula fields may the gated UI show?** Recommendation: **composition +
  members + a descriptive line only**, never the raw `indications`/
  `traditional_use`/`dosing_notes` (those are exactly what Plan 004 / the
  practitioner review are remediating). **Owner to confirm** the surfaced field
  set before Phase 5 authoring.
- **Large formula list pagination.** The corpus is big; ensure the pager and
  `callback_data` (formula id + page index) stay within 64 bytes and the list is
  searchable, not just scrollable.
- **Cross-link consistency.** A herb card promising "входит в формулы" while the
  branch is off would be a dead end — hence the section is hidden, not disabled,
  when the flag is off.
- **Sibling-branch sequencing.** `📖 Статьи` (Plan 006) and `💡 Советы` browse
  (Plan 005) may not exist yet; the hub must hide absent branches gracefully and
  light them up when those plans land.
- **Search scope creep.** Resist turning this into a ranked search rewrite; keep
  substring, improve only the presentation/navigation.

## Verification

- `npm run typecheck && npm run lint && npm test && npm run build &&
  npm run content:index:check` — green.
- Manual (branch **withheld** = default): `📚 Библиотека` shows no `🧪 Формулы`;
  search returns no formulas; herb cards show no cross-link section. A test
  asserts this.
- Manual (branch **registered** = post sign-off): `🧪 Формулы` browses/searches; a
  formula card cross-links to its member herbs; a herb card lists "входит в
  формулы" and links back; disclaimer on every medicine card; one message per
  session; pagination correct at both ends.
- Unit: reverse cross-link map; combinations-surface-absent-by-default; pager bounds.

## Progress

- [x] Phase 1 — Reverse cross-link index (herb ↔ formulas) — `4767591`
- [x] Phase 2 — Library hub + herb browse — `5c6695e`
- [x] Phase 3 — Rich herb card with cross-links
- [ ] Phase 4 — Search integrated into the library
- [ ] Phase 5 — Combinations browser (withheld) + validation, docs & close
