# Plan 030 — Centralize duplicated platform constants

**Status:** Draft
**Created:** 2026-07-01
**Completed:** —
**Bump on close:** patch

## Context

The maintainability review (2026-07-01) found several platform/time constants
**defined twice** in unrelated files, free to drift apart — one pair even carries
a comment asking a human to keep them in sync manually:

- **Telegram `callback_data` 64-byte limit** — `bot/keyboards.ts:19`
  (`CALLBACK_DATA_LIMIT`) **and** `services/version-announcer.ts:333`
  (`TELEGRAM_CALLBACK_DATA_LIMIT`).
- **Telegram message char budget `3800`** — `bot/render/markdown.ts:12`
  (`TELEGRAM_LIMIT`) **and** `bot/messages/version-announcements.ts:25`
  (`CHANGELOG_BUDGET`), with a "keep in sync" comment at
  `version-announcements.ts:22`.
- **`MS_PER_DAY` (`86_400_000`)** — `notifications/recurrence.ts:17` **and**
  `bot/commands/reminder-create.ts:256`.

`src/config.ts` intentionally holds only **env-derived** config and is the wrong
home for hard platform invariants. This plan introduces a small
`src/constants.ts` (framework-free, ADR 003 clean) as the single source of truth
for these, so the twin definitions can't diverge.

Independent of the other review plans; low-risk, mechanical. Good to land early.

## Goals / Non-goals

- **Goals:**
  - New `src/constants.ts` exporting the shared platform/time constants with a
    doc comment per value (what Telegram rule / unit it encodes).
  - All duplicate definitions replaced by imports from `constants.ts`.
  - Where two values were *semantically distinct despite sharing a number* (e.g.
    the changelog budget vs. the generic message limit both being 3800), decide
    per case: unify only if they are genuinely the same invariant; otherwise keep
    separate names but derive both from the canonical base with a comment.
- **Non-goals:**
  - No value changes — same numbers, one home.
  - Not sweeping every single-use local `const` into the file (e.g.
    `SESSION_TTL_MS`, `DEFAULT_MAX_ENTRIES`) — only the **duplicated** ones. A
    single-use constant next to its use site is fine.
  - `config.ts` stays env-only; `constants.ts` is compile-time invariants.

## Phases

### Phase 1 — introduce constants.ts and rewire duplicates
- **Deliverables:**
  - `src/constants.ts` with (at least) `CALLBACK_DATA_LIMIT = 64`,
    `TELEGRAM_MESSAGE_LIMIT = 3800`, `MS_PER_DAY = 86_400_000`, each documented.
  - `keyboards.ts`, `version-announcer.ts`, `render/markdown.ts`,
    `messages/version-announcements.ts`, `recurrence.ts`, `reminder-create.ts`
    import from `constants.ts`; local duplicate `const`s removed.
  - Verify no framework import leaks into `constants.ts` (ESLint ADR-003 guard
    must stay green — the file is imported by both `bot/` and `notifications/`).
- **Acceptance:** `pnpm run typecheck && pnpm run lint && pnpm test` green; grep
  confirms each constant is defined exactly once; `assertCallbackData` and the
  message splitter behave identically (existing tests cover them).

## Risks / Open questions

- **3800 unification [low].** Confirm the changelog budget and the generic
  message limit are meant to be the same number or merely coincidentally equal.
  If independent, keep two named exports (both = 3800) rather than one — document
  the intent so a future change to one doesn't silently move the other.
- **Import-cycle check [low].** `constants.ts` must import nothing from `src/`
  (leaf module) to avoid cycles.

## Verification

Full gate green under pnpm; `rg` shows one definition site per constant; message
splitting, callback-data assertion, and recurrence date math unchanged (existing
tests pass).

## Progress

- [ ] Phase 1 — constants.ts + rewire
