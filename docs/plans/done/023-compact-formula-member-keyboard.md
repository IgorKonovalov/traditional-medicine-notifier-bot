# Plan 023 — Compact the formula-card member keyboard

**Status:** Completed
**Created:** 2026-06-29
**Completed:** 2026-06-30
**Bump on close:** patch

## Context

On a Составы (formula) card the member ingredients are rendered as inline
**callback buttons, one per row** (`formulaCardKeyboard`,
`src/bot/commands/_formula-card.ts:189-197`). A typical formula has up to ~8
members, so the keyboard alone is ~8 rows tall before the nav row — it dominates
the screen and pushes the card text out of view. Owner feedback: "keyboard takes
too much space."

The owner initially asked whether the member links could become **inline `<a>`
text links** instead of a keyboard. Investigation (this session) found that
although the formula card already runs on the HTML lane (ADR 011, `html: true`),
an inline `<a href>` link **cannot carry `callback_data`** — it can only point at
a URL. The only navigable form would be a `t.me/<bot>?start=herb_<id>` deep link,
and tapping one **spawns a fresh `/start` message instead of editing the anchor
in place**, breaking the ADR 009 anchor-edit drilldown that every other
cross-link uses (and there is no start-payload router today). So inline links
trade the smooth in-place navigation for compactness.

The space problem is not the keyboard *mechanism* — it is the **one-button-per-
row** layout. Packing members into a multi-column grid keeps the ADR 009
callback navigation (anchor edited in place) and still removes most of the
height. Decision (owner, 2026-06-29): **compact the keyboard**, do not switch to
inline links.

The composition is already listed in full inside the card body
(`renderFormula`, `_formula-card.ts:152-157`), so the member buttons are purely
a navigation affordance — shrinking them loses no information.

Related: ADR 009 (navigation model — anchor-edit drilldown, callback-data
convention), ADR 011 (HTML rendering), the gated formula branch
(`_formula-gate.ts → FORMULA_BRANCH_ENABLED`, `docs/medical-review.md`).

## Goals / Non-goals

- **Goals:**
  - Render formula-card member buttons in a **3-column grid** instead of one per
    row, cutting keyboard height ~⅔ for typical formulas.
  - Preserve everything else: the `lib:herb:<id>` callback route, label text
    (full `nameRu`), button order, the trailing nav rows, and the ≤64-byte
    `assertCallbackData` guard.
- **Non-goals:**
  - No inline `<a>` text links and **no `?start=` deep-link router** (rejected
    above — would break ADR 009 in-place navigation).
  - No change to card body text, the herb-card reverse links
    (`lib:formula:<id>`, `_herb-card.ts`), or any other keyboard surface.
  - No 4+ columns, and no per-row adaptive column count (out of scope — flat
    3-up grid).

## Phases

### Phase 1 — Two-column member grid

- **Deliverables:**
  - `src/bot/commands/_formula-card.ts` — change `formulaCardKeyboard` so
    `memberLinks` are chunked into rows of **3** (a small local `chunk`/grid
    inline, no new module) before the `navRows` are appended. Each button keeps
    `Markup.button.callback(link.nameRu, assertCallbackData(`lib:herb:${link.id}`))`.
    A non-multiple-of-3 count leaves 1–2 buttons in the final member row
    (Telegram renders a short row fine); the nav rows still follow on their own
    rows.
  - `src/bot/commands/_formula-card.test.ts` — update/extend the keyboard test to
    assert: members are grouped 3-per-row, a remainder count leaves the leftover
    buttons in the last member row, callback data is still `lib:herb:<id>` and
    order is preserved, and the `navRows` remain appended unchanged after the
    member grid.
- **Acceptance:**
  - A formula with 8 resolvable members yields **3 member rows** of 3/3/2 (was
    8), each button still opening the correct herb card via `lib:herb:<id>`.
  - `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass.
  - Manual: open a multi-member formula card in the bot; member buttons appear
    two-up; tapping one edits the anchor in place to the herb card (unchanged
    navigation).

## Risks / Open questions

- **Long-name wrapping at 3-up (accepted trade-off).** Ingredient names run to
  32 chars with parenthetical glosses (p90 ≈ 23). At 3 columns, rows mixing long
  names will wrap each button to 2–3 lines on narrow screens, so the height
  saving over 2-up is smaller in practice and the buttons read more cramped.
  Owner chose 3-up (2026-06-29) for the tighter default; revisit to 2-up only if
  the wrapping looks bad in the live bot.
- **Remainder row** (1–2 buttons) renders left-aligned/centered by Telegram —
  cosmetic only, no action needed.

## Verification

- `npm run typecheck && npm run lint && npm test && npm run build`
- In the bot (formula branch is live): Библиотека → 🧪 Составы → open a formula
  with several members. Confirm the member buttons render two per row, the card
  text is no longer pushed off-screen, and tapping any member opens that herb's
  card by editing the same anchor message (no new message spawned).

## Progress

- [x] Phase 1 — Two-column member grid (`fa8b1d9`; closed `v0.24.1`)
