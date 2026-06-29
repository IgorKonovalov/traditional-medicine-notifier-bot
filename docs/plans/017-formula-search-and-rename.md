# Plan 017 — formula-scoped search + rename «Формулы» → «Составы»

**Status:** Approved
**Created:** 2026-06-29
**Approved:** 2026-06-29 (owner)
**Completed:** —
**Bump on close:** minor

## Context

The formula (combination) browser is live (ADR 006 sign-off, `FORMULA_BRANCH_ENABLED = true`).
Tapping the 🧪 branch lands the user directly on a flat, paginated list of **all 149
formulas** (`formula-list` screen, `formulaListView`). With that many entries, browsing
to a known formula is slow. The owner wants two changes:

1. **A search scoped to formulas, reachable from inside the formula section.** Today the
   only search is the top-level 🔎 Поиск (`lib:search`), which returns herbs **and**
   formulas mixed (`searchHits`, formulas included only when the gate is on). That global
   search stays exactly as it is. We add a **second, formula-only** search that lives in
   the formula section so a user browsing formulas can filter to one without leaving the
   branch.
2. **Rename the user-facing label «Формулы» → «Составы».** This is a **display-label change
   only.** All internal vocabulary stays: callback scopes (`lib:formula:*`, `lib:flist:*`),
   state/property keys (`formulas`, `formulaId`, `formulasTitle`), the `Combination` type,
   content ids (`tib-formula-*`), function names (`formulaMatches`, `formulaListView`), and
   ADR/code references to "formula/combination". Content ids are stable join keys and never
   change (CLAUDE.md). The product simply *presents* formulas as «Составы».

Relevant prior art: **ADR 009** (navigation model — anchor-edit drilldown, callback
prologue, `<scope>:<action>:<arg>` convention), **Plan 009** (the library browser this
extends), **ADR 006** (the doctor-gate the formula branch sits behind). No new ADR is
warranted: this is an additive screen within the established navigation kit plus a string
relabel — no hard-to-reverse architectural decision.

### Decisions captured (owner, 2026-06-29)

- **Global 🔎 Поиск stays unified** (herbs + formulas mixed) — unchanged. The new
  formula-only search is *additional*; formulas become searchable from two places, by
  design.
- **Entry shape: a 🔎 button at the top of the formula list** (not a sub-hub). Tapping
  🧪 Составы still lands on the flat list; the search button sits as the first keyboard row
  above the formula entries.

## Goals / Non-goals

- **Goals:**
  - A formula-only search reachable via a 🔎 button at the top of the `formula-list` screen.
  - Typed query filters formulas only (reusing `formulaMatches`), renders formula hits that
    open the existing formula card; results paginate; `« Назад` / 🏠 chrome consistent with
    the rest of the library.
  - Correct back-navigation: formula-search → formula-list; formula-results → formula-search;
    a formula card opened **from formula-results** returns to those results (not to the
    global mixed results).
  - Rename every **user-facing** «Формулы/формул» occurrence to «Составы/составов»; keep all
    internal identifiers, callbacks, and ids unchanged.
  - Tests cover the new screens, the formula-only filtering, back-states, and the relabel.

- **Non-goals:**
  - Changing the top-level 🔎 Поиск behavior or its mixed herb+formula results.
  - Renaming any callback scope, state key, function, type, content id, or ADR/code term.
  - Adding a formula sub-hub or "по категории" browsing (possible later; out of scope here).
  - Fuzzy/ranked search — same case-insensitive substring match the rest of the bot uses.
  - Re-surfacing Chinese content or touching the visibility gate (ADR 013).

## Phases

### Phase 1 — formula-scoped search surface

All changes in `src/bot/commands/library.ts` (the formula handlers already live inside the
`if (FORMULA_BRANCH_ENABLED)` block — keep the new handlers there so nothing leaks while the
gate is off) and `src/bot/messages.ts`.

- **State (`Screen` + `LibraryState`):**
  - Add two screens: `'formula-search'` and `'formula-results'`.
  - Reuse the existing `query` field for the formula-search query (normalized lowercase),
    same as the global search.
  - Add one discriminator so a `formula-card` opened from formula-results can find its way
    back: a `formulaScope?: true` marker carried onto the card state when the originating
    screen is `formula-results`. (The shared `formula-card` screen is otherwise reached from
    the global `results` screen and from `formula-list`; `query` alone can't tell origin 1
    from origin 3.)

- **Views:**
  - `formulaListView`: prepend a single button row
    `[🔎 messages.library.formulasSearch → lib:fsearch]` above the formula entries, on every
    page (back/home rows stay at the bottom).
  - `formulaSearchPromptView()`: text `messages.search.formulaPrompt`, keyboard `back`+`home`.
    Mirrors `searchPromptView`.
  - `formulaResultsView(deps, state)`: filter `deps.content.combinations.all` via
    `formulaMatches(c, state.query)`, map to `lib:formula:<id>` buttons, paginate with a new
    `lib:fresults` pager (`PAGE_SIZE`, `clampPage`). Empty → `messages.search.nothingFound`
    (reused); title → `messages.search.results` (reused). Wire both into `viewFor`.

- **Routing (`backState` + `viewFor` + registration, inside the gate block):**
  - `viewFor`: `formula-search` → prompt view; `formula-results` → results view.
  - `backState`: `formula-search` → `formula-list`; `formula-results` → `formula-search`;
    extend the existing `formula-card` case to:
    `formulaScope === true && query !== undefined` → `{ formula-results, query, page }`,
    else existing `query !== undefined` → `{ results, query, page }`, else `{ formula-list }`.
  - New actions (registered only when `FORMULA_BRANCH_ENABLED`):
    - `lib:fsearch` → `go(... { screen: 'formula-search', page: 0 })`.
    - `lib:fresults:(\d+)` → `go(... { screen: 'formula-results', query, page })` (no-op if
      `query` undefined); `lib:fresults:noop` → `answerCbQuery`.
  - Extend the existing `lib:formula:(.+)` handler to also set `formulaScope: true` when
    `v.session.state.screen === 'formula-results'` (alongside the existing `query` carry).
  - Run every new payload through `assertCallbackData`; all are well under 64 bytes.

- **Text capture (`registerLibrarySearchTextCapture`):** broaden the guard so it also fires
  when `session.state.screen === 'formula-search'`, routing the typed text to
  `{ screen: 'formula-results', query, page: 0 }` (the `search` branch keeps routing to
  `results`). Single `bot.on('text')` handler, one branch on the parked screen.

- **Messages (`src/bot/messages.ts`):** add
  - `library.formulasSearch: '🔎 Поиск по составам'`
  - `search.formulaPrompt: 'Введите название состава для поиска:'`

- **Acceptance:**
  - `formula-list` keyboard includes the 🔎 search button as its first row.
  - Tapping it parks the session on `formula-search`; typing a query edits the anchor into
    `formula-results` showing **only** formula hits — a query that also matches a herb does
    **not** surface the herb here.
  - Results paginate; tapping a hit opens the formula card; `« Назад` returns to the formula
    results (with the query intact), and again to the search prompt, and again to the list.
  - The global 🔎 Поиск is untouched (still returns mixed herb+formula hits).

### Phase 2 — rename «Формулы» → «Составы» (label-only)

- **`src/bot/messages.ts`:**
  - `library.formulas`: `'🧪 Формулы'` → `'🧪 Составы'`
  - `library.formulasTitle`: `'Формулы'` → `'Составы'`
  - `library.formulasEmpty`: `'Пока нет формул.'` → `'Пока нет составов.'`
  - `herbCard.inFormulas`: `'Входит в формулы:'` → `'Входит в составы:'`
  - `herbCard.inFormulasCapped`: `'Входит в формулы (показаны … из …):'`
    → `'Входит в составы (показаны … из …):'`
  - (Keep all property **keys** — only the string values change.)

- **`src/bot/messages/version-announcements.ts`** (consistency — `/changelog` re-renders these
  live, so leaving «формул» there would read inconsistently next to the new «составы»):
  - 0.11.0 / 0.13.0 / 0.15.0 entries: «формулы»/«формул» → «составы»/«составов» in the
    user-facing sentences. These are already-broadcast historical strings; editing them only
    affects how `/changelog` displays history — low-risk.

- **Doc/comment consistency (non-blocking, same close commit):** update the user-facing label
  mentions in `CLAUDE.md` (Navigation model — note that the branch is *labelled* «Составы»
  while code/ids keep "formula/combination") and the `🧪 Формулы` references in
  `library.ts` / `_formula-gate.ts` header comments to read «Составы» for accuracy. **Do not**
  touch callback scopes, function names, or the `Tradition`/`Combination` vocabulary.

- **Acceptance:** no user-facing string renders «Формул…»; `grep -i 'формул'` over `src` is
  clean **except** internal/test identifiers and code-comment vocabulary (`formula`,
  `formulaId`, fixture names). Internal callback data and ids are byte-for-byte unchanged.

### Phase 3 — tests

- **`src/bot/commands/library.test.ts`:**
  - Update the existing hub assertion `'🧪 Формулы'` → `'🧪 Составы'`.
  - `formula-list` view exposes the 🔎 «Поиск по составам» button.
  - Text capture parked on `formula-search` routes a query to `formula-results` with
    **formula-only** hits (assert a herb-matching token does not leak a herb into the result
    buttons).
  - `formula-results` paginates; back-states: `formula-results` → `formula-search`,
    `formula-search` → `formula-list`, and a `formula-card` carrying `formulaScope` →
    `formula-results` (vs. a card carrying only `query` → global `results`).
- **`src/bot/commands/_herb-card.test.ts`:** update the three `'Входит в формулы…'`
  assertions to «составы».
- **Acceptance:** `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` all green;
  `npm run content:index:check` clean (no content touched).

## Risks / Open questions

- **Back-origin ambiguity for the shared formula card.** A `formula-card` is now reachable
  from global `results`, `formula-list`, and `formula-results`. Mitigated by the explicit
  `formulaScope` marker set at card-open time from the originating screen — keep that the
  single source of truth and the `backState` branch order as specified.
- **Two search paths over formulas.** By owner decision the global search still returns
  formulas too, so a formula is findable from both 🔎 Поиск and 🔎 Поиск по составам. This is
  intended redundancy, not a bug — note it so a future reviewer doesn't "dedupe" it away.
- **Relabel vs. internal vocabulary drift.** After this, the UI says «Составы» but the code,
  callbacks, and docs say "formula/combination". This split is deliberate and documented in
  CLAUDE.md; flag it rather than chasing a full rename of stable join keys.
- **Editing historical version announcements** is mildly revisionist but only affects
  `/changelog` rendering and keeps terminology consistent; acceptable.

## Verification

End-to-end (private pre-launch bot, gate on):

1. `/library` → 🧪 **Составы** → lands on the formula list with **🔎 Поиск по составам** as
   the top row.
2. Tap it → prompt «Введите название состава для поиска:». Type a fragment that matches a
   formula (e.g. `агар`) → results list shows only formulas; tap one → formula card opens.
3. `« Назад` → back to the formula results (query preserved) → `« Назад` → prompt →
   `« Назад` → formula list. 🏠 returns to the hub from any of these.
4. Type a fragment that matches **both** a herb and a formula → formula results show only the
   formula (no herb leaks).
5. Top-level 🔎 Поиск still returns the herb **and** the formula for that same fragment
   (unchanged).
6. A herb card whose herb belongs to formulas shows the «**Входит в составы:**» section.
7. `/changelog` and the hub show «Составы» everywhere; no «Формул…» remains in the UI.
8. Gate off (`FORMULA_BRANCH_ENABLED = false`, smoke-check): the formula branch, its search
   button, and the `lib:fsearch`/`lib:fresults` handlers are all absent — a hand-crafted
   `lib:fsearch` tap falls through to a no-op.

Commands: `npm run typecheck && npm run lint && npm test && npm run build && npm run content:index:check`.

## Progress

- [x] Phase 1 — formula-scoped search surface (`formula-search`/`formula-results`
  screens, 🔎 button on the formula list, `lib:fsearch`/`lib:fresults` actions,
  `formulaScope` back-marker, text capture broadened)
- [x] Phase 2 — rename «Формулы» → «Составы» (messages, historical version
  announcements 0.11/0.13/0.15, CLAUDE.md + code-comment label mentions; internal
  vocabulary/callbacks/ids unchanged)
- [x] Phase 3 — tests (back-states, formula-list 🔎 button, formula-only filtering,
  text-capture routing, herb-card label assertions). `typecheck`/`lint`/`test`
  (228)/`build`/`content:index:check` all green.
