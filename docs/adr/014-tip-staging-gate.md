# ADR 014 — Tip-staging gate (disease-indication tips authored-but-gated)

**Date:** 2026-06-29
**Status:** **Withdrawn (2026-06-29)** — built and then reverted within Plan 018
before any release. The gated disease-indication tier it governed was dropped on
the owner's decision: the food-property content already lives in the structured
**foods corpus** (ADR 012), the geriatric audience is out of focus, and a smaller
tip pool is acceptable. With no staging content, the gate was unused machinery, so
`Tip.status`, the `includeStagingTips` loader opt, `isProductionTip`, the index
`status` projection, the gate tests, and the review tooling were all removed. The
record is kept so the design isn't silently re-proposed; **if a gated tip tier is
revived, write a fresh ADR** rather than reinstating this one. Everything below is
the original (now historical) decision.

---

**Original status:** Accepted (2026-06-29, Plan 018)

## Context

Plan 018 expands the daily-tip pool from 60 to ~190–200 in **two tiers**:

- **Production-visible** (~95–100) — lifestyle / conduct / theory tips in the
  Plan 012 clinical register. Safe to ship.
- **Gated staging** (~80–90) — **disease-indication** tips mined from the Сова
  Ригпа food-property catalogue and the geriatric chapter ("в традиции при X
  применяют Y"). This is medical-adjacent content that **must not reach the
  production bot** before a qualified Tibetan-medicine practitioner signs off —
  the same hard production gate the formula verbose fields sit behind (ADR 006).

The corpus already has the right precedent for "authored-but-hidden" content: the
**tradition visibility gate** (ADR 013) drops Chinese records at a single
content-load chokepoint (`loadContent`) while the index builder opts out so the
committed index keeps every authored record. The non-medical-advice invariant
(CLAUDE.md) is the headline risk here, so the gate is not optional polish — it is
what makes authoring the gated tier acceptable at all.

Forces:

- **No leak tolerance.** A tip reaches users through several paths off one pool:
  the proactive daily push (`pickDailyTip`), the 💡 «Совет дня» library leaf, and
  search — all of which iterate `content.tips.all`. A per-surface filter would
  leave leak paths. The codebase prefers a **single content-load chokepoint** for
  exactly this (ADR 013, `_formula-gate.ts`).
- **Per-tip sign-off, not blanket.** Unlike the tradition gate (one binary flip
  for a whole tradition), disease-indication tips are reviewed and promoted
  **individually** by the doctor — the gate must support promoting a subset.
- **Reviewers must not be pushed unvetted medical claims.** The pre-launch bot is
  used for live review; routing unapproved disease-indication tips into its daily
  rotation would push exactly the claims under review at the reviewer.
- **Backward-compatible.** The 60 existing tips carry no `status` and must stay
  published without edits.
- **Portability (ADR 003).** The filter stays framework-free, in `src/content/`.

## Decision

**Add a per-tip `status` field and gate `status: staging` tips out of the runtime
tip pool at the `loadContent` chokepoint. Gated tips are review-only — never
visible on any bot (private or public) — and are promoted to production
individually by removing the flag on documented doctor sign-off.**

1. **`Tip.status` field.** Extend the `Tip` type and frontmatter schema with
   `status: 'published' | 'staging'`, **defaulting to `published`** when absent
   (`parseTip` validates the enum, file-pathed fail-fast). The 60 existing tips
   need no edit. The gated tier carries `status: staging` explicitly.

2. **Filter at `loadContent` (single chokepoint).** Mirror
   `includeHiddenTraditions`: add a `LoadOptions.includeStagingTips` opt
   (default `false`). When off, `loadContent` drops every `status: staging` tip
   **before** buckets/validation, so `content.tips.all` — and therefore
   `pickDailyTip`, the 💡 leaf, and search — excludes them **by construction**,
   with zero per-surface edits and no leak path. The visibility predicate lives in
   `src/content/visibility.ts` alongside the tradition gate (e.g.
   `isProductionTip(tip)` / a small helper), keeping both gates in one
   framework-free module.

3. **Index builder opts in.** The content-index builder calls
   `loadContent(dir, { includeHiddenTraditions: true, includeStagingTips: true })`
   so the committed `content/.index/tips.json` keeps **every** authored tip. The
   `status` is projected into `TipIndexEntry` so the index records the tier;
   `content:index:check` stays green.

4. **Review-only — gated tips are visible on no bot.** Both the private pre-launch
   bot and the public bot load with the default (`includeStagingTips: false`), so
   gated tips are **never** served, rotated, or searchable on either. Reviewers
   read them through a **generated HTML review artifact** under
   `research/_private/` (extending the existing `content:review` tooling), tracked
   for sign-off in `docs/medical-review.md`. This is the owner's choice
   (2026-06-29) over the formula-style "live on the private bot" model — reviewers
   are never pushed unvetted disease-indication claims, and the eventual
   production launch is a no-op for end users.

5. **Promotion is per-tip, on documented sign-off.** There is **no blanket
   constant flip** (this supersedes Plan 018's loose "one-edit production flip"
   phrasing, which described the rejected formula-style model). When the doctor
   signs off a tip in `docs/medical-review.md`, that file's `status: staging` is
   **removed** (→ default `published`) and it enters the pool. Sign-off is
   per-tip / per-batch, matching how individual medical claims are vetted.

6. **No change to selection, rotation, or the proactive budget.** `pickDailyTip`
   stays pure index-order; ADR 004's ≤1-proactive-push/day cap is untouched. The
   gate only changes which tips populate `content.tips.all`.

## Consequences

- The gated disease-indication tier can be authored and committed now, fully
  indexed for review, with **zero** risk of reaching a user before sign-off — the
  non-medical-advice invariant is enforced by construction, not by discipline.
- Every tip consumer that reads `content.tips.all` is covered automatically;
  future tip surfaces inherit the gate for free as long as they read the pool.
- Promotion after review is a small content edit (drop `status: staging`) +
  index regen + a `docs/medical-review.md` update — no code change, no deploy gate.
- `content:index:check` must tolerate `status` in `tips.json`; the index now
  carries tips the runtime never serves (parallel to Chinese herbs in the index).
- **CLAUDE.md / architect Project Context** gain a tip-staging-gate note
  alongside the tradition gate and formula gate.

## Alternatives considered

- **Formula-style "live on the private bot" flip** (a `STAGING_TIPS_VISIBLE`
  constant that surfaces gated tips in the private bot's rotation, off at public
  launch). Rejected by the owner: it pushes unvetted disease-indication claims at
  reviewers via the daily tip and the 💡 leaf, and bundles all gated tips into one
  binary flip instead of per-tip medical sign-off.
- **A separate `content/tips-staging/` directory** instead of a frontmatter flag.
  Rejected: splits the corpus, complicates the loader walk and id-uniqueness, and
  makes per-tip promotion a file move rather than a one-line edit. A frontmatter
  flag mirrors the established tradition/formula gate shape.
- **A runtime/env flag.** Rejected: the gate is a deliberate compile-time content
  state, not per-environment config — same reasoning as `VISIBLE_TRADITIONS` and
  `FORMULA_BRANCH_ENABLED`.

## References

- ADR 013 (Tibetan-only surface) — the content-load visibility chokepoint and
  `includeHiddenTraditions` opt this gate mirrors (`src/content/visibility.ts`).
- ADR 006 (verbose source data doctor-gated) — the production sign-off discipline
  and `docs/medical-review.md` tracking this tier joins.
- ADR 004 (proactive budget) — untouched; the gate is upstream of dispatch.
- ADR 003 (portability) — the filter stays framework-free in `src/content/`.
- Plan 018 (expand tips to ~190–200) — the implementation; Plan 012 (voice spec);
  Plan 005 (the original 60-tip pool).
