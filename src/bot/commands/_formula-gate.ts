/**
 * ADR 006 doctor-gate, single source of truth (Plan 009).
 *
 * One compile-time constant gates every place a formula could surface (there is
 * no runtime/env flag — the bot is private and pre-launch, Plan 009 amendment
 * 2026-06-28):
 *
 *   1. the `🧪 Составы` hub branch (library.ts; labelled «Составы», code keeps
 *      the "formula/combination" vocabulary — Plan 017),
 *   2. formula hits in the library search haystack (search), and
 *   3. the herb-card "Входит в составы" cross-link section (_herb-card.ts).
 *
 * The combinations corpus is non-sanitised staging data, so this stayed `false`
 * (surface provably absent, asserted by tests) until the owner's documented
 * medical sign-off.
 *
 * **Lifted 2026-06-28 (owner sign-off, recorded in `docs/medical-review.md`).**
 * Now `true`: the branch is registered and the formula card surfaces the
 * owner-approved field set (name/nature/composition/member cross-links/themes/
 * cautions) and, as of the owner sign-off 2026-06-29, the structured verbose
 * fields (indications/traditional use/dosing) too, as a live-review surface —
 * only the raw `sourceText`/`body` stay unsurfaced.
 */
export const FORMULA_BRANCH_ENABLED = true;
