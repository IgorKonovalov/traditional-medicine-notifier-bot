# Plan 029 — Split the two oversized command modules

**Status:** Completed
**Created:** 2026-07-01
**Completed:** 2026-07-01
**Bump on close:** patch (v0.27.4)

## Context

The maintainability review (2026-07-01) flagged the two largest production
modules, each well over the ~400-line comfort line and mixing several concerns:

- **`src/bot/commands/library.ts` — 1326 lines.** One `registerLibraryCommand`
  registers ~35 `bot.action` handlers (`library.ts:951-1298`) across every
  library sub-branch (ingredients, formulas, guides, foods, category browse,
  formula-search) alongside their state/session types and render helpers.
- **`src/bot/commands/reminder-create.ts` — 1051 lines.** The multi-step
  reminder wizard: hour picker, weekday/interval logic, herb-attach paging, and
  many callback branches in one file.

Both are cohesive *features* but too large to navigate. The codebase already has
the right decomposition idiom — sibling `_*-card.ts` helpers
(`_herb-card.ts`, `_formula-card.ts`, `_guide-card.ts`) pulled out of the same
`commands/` folder. This plan applies that idiom to break each module into a thin
registrar plus focused sub-flow siblings, **no behavior change**.

**Sequencing:** best done *after* plan 031 (shared `onSession` callback registrar
+ `startCronTick` helper), so the split consumes the registrar instead of copying
the per-action scaffold into each new sibling. If 031 is deferred, this plan can
still proceed but will carry the current wrapper shape.

## Goals / Non-goals

- **Goals:**
  - `library.ts` reduced to a thin orchestrator; each library sub-branch
    (ingredients / formulas / guides / foods / category / formula-search) lives
    in its own `commands/library/*.ts` (or `_library-*.ts`) sibling with its
    own handlers, state slice, and render helpers.
  - `reminder-create.ts` split so the wizard steps (time picker, recurrence,
    herb-attach paging) are separable units.
  - No production module over ~500 lines afterward (target; `messages.ts`, a flat
    string table, is exempt).
  - Behavior identical — same callback-data scopes/ids (`br:*`, `lib:*`, `rc:*`),
    same screens, same session semantics (ADR 009).
- **Non-goals:**
  - No new features, screens, or copy changes.
  - No callback-data renaming (stable join keys — CLAUDE.md).
  - Not touching other large files (`messages.ts`, `content/loader.ts` at 404 is
    cohesive and stays).

## Phases

### Phase 1 — carve out `library.ts` sub-branches
- **Deliverables:** a `src/bot/commands/library/` folder (or `_library-*.ts`
  siblings, matching whichever the owner prefers — see open question) holding one
  module per branch; `library.ts` becomes the registrar that wires them. Move the
  per-branch `LibraryState` slices and render helpers with their handlers.
- **Acceptance:** `pnpm run typecheck && pnpm run lint && pnpm test` green; the
  library command test (`library.test.ts`) passes unchanged; manual smoke of each
  branch (browse ingredient → card, formula list → card → member cross-link,
  guide pager, food filter, category, formula-search) behaves identically.

### Phase 2 — split `reminder-create.ts` wizard steps
- **Deliverables:** extract the time-picker, recurrence-selection, and
  herb-attach paging into focused units under `commands/reminder-create/` (or
  siblings); the entry file wires the wizard.
- **Acceptance:** `reminder-create.test.ts` passes unchanged; a full wizard run
  (create daily / weekly / interval reminder, with and without an attached herb)
  is unchanged end-to-end.

## Risks / Open questions

- **Churn vs. plan 031 [medium].** If 029 runs before 031, the split siblings
  copy the current callback wrapper and 031 later rewrites them. Recommend 031
  first. Flag at handoff.
- **Folder vs. flat-sibling convention — open.** The repo currently uses flat
  `_*-card.ts` siblings, not subfolders. Decide whether `library.ts` grows a
  `library/` subfolder (cleaner for ~6 branches) or stays flat `_library-*.ts`
  (consistent with today). Recommend a `library/` subfolder given the branch
  count; confirm before implementing.
- **Pure move discipline [medium].** This must be a mechanical extraction with no
  logic edits, so review diffs stay reviewable and the test suite is the safety
  net. Any behavior change discovered mid-split is flagged, not folded in.

## Verification

Full gate green under pnpm; `library.test.ts` and `reminder-create.test.ts`
unchanged and passing; manual smoke of every library branch and a full
reminder-create wizard run show no behavioral difference. `git diff` is
move-only (no logic deltas) outside the new registrar wiring.

## Progress

- [x] Phase 1 — split `library.ts` into a `commands/library/` package. Owner
      chose the subfolder layout. Modules: `state` (shared types/View/anchor
      dispatch/persist/clampPage), `hub`, one per branch (`herbs`/`search`/
      `formulas`/`guides`/`foods`/`tips`), `dispatch` (viewFor/backState),
      `entries`, and `index` (registrar via `onSession` + barrel). `./library`
      resolves to `library/index.ts`, which re-exports the same symbols, so
      `library.test.ts` and every importer are unchanged. Largest module 355
      lines. Pure move — callback scopes/ids + ADR 009 semantics identical.
- [x] Phase 2 — split `reminder-create.ts` into a `commands/reminder-create/`
      package. Modules: `draft` (pure domain core), `steps` (step graph),
      `describe` (summary + weekday helpers), `message` (fired-reminder payload),
      `view-kit` (shared View/chunk/navRow — leaf), `time-view` (time picker),
      `link-view` (herb-attach paging), `views` (recurrence-selection +
      dispatcher), and `index` (registrar + entry + text capture + barrel).
      `reminder-create.test.ts` unchanged. Largest module 469 lines. Pure move.
