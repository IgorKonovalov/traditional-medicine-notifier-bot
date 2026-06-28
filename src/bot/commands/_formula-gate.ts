/**
 * ADR 006 doctor-gate, single source of truth (Plan 009).
 *
 * The combinations (formula) surface is **built but withheld**: the corpus is
 * non-sanitised staging data that must not reach users until the owner's
 * documented medical sign-off. There is no runtime config flag (the bot is
 * private and pre-launch — Plan 009 amendment 2026-06-28); instead this one
 * compile-time constant gates every place a formula could surface:
 *
 *   1. the `🧪 Формулы` hub branch (library.ts),
 *   2. formula hits in the library search haystack (search), and
 *   3. the herb-card "Входит в формулы" cross-link section (_herb-card.ts).
 *
 * Flip it to `true` only after sign-off. While it is `false`, the formula
 * surface is provably absent — asserted by a test (Phase 5).
 *
 * **Lifted 2026-06-28 (owner sign-off, recorded in `docs/medical-review.md`).**
 * The combinations branch is now registered: the formula card surfaces only the
 * owner-approved minimal field set (name/nature/composition/member cross-links/
 * themes/cautions) — the verbose review-pending fields stay unsurfaced.
 */
export const FORMULA_BRANCH_ENABLED = true;
