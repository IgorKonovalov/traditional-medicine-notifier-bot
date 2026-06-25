# ADR 006 — Verbose source data for combinations, doctor-gated before production

**Date:** 2026-06-25
**Status:** Accepted — supersedes the descriptive-only decision of ADR 005 (for
combinations) and amends the per-page-disclaimer decision of ADR 002.

## Context

ADR 005 modelled combinations as **descriptive-only** (`themes`, never
indications/dosing) to honour the `CLAUDE.md` medical-disclaimer invariant. That
invariant was protective *in the absence of expert review*: with no clinician in
the loop, the safe default was to strip all prescriptive material.

The project owner has changed that footing. The goal is now the **richest possible
reference** — including the original source indications, traditional usage, and
source descriptions — which a **qualified Tibetan-medicine practitioner will review
before anything reaches the production bot**. The human expert gate replaces the
blanket strip-everything default. The owner also wants a **single shared disclaimer**
rather than one baked into every page.

## Decision

1. **Verbose, non-sanitised source data is allowed in the combinations corpus.**
   Records may carry the original indications, traditional usage, and source text in
   **structured frontmatter fields plus a readable body** (exact schema defined in
   Plan 002). `themes` is no longer required to be the only, sanitised surface.

2. **Single, bot-appended disclaimer.** The standard disclaimer
   (`messages.disclaimer`) is appended **at render time** by the bot to every
   medicine page (herbs *and* combinations). The per-page baked-in disclaimer is
   removed from content files. This amends ADR 002 (which baked it per page).

3. **Production gate (non-negotiable).** The verbose corpus is a **staging/dev
   artifact**. No verbose medicine content ships to the **production** bot without
   documented sign-off from a qualified Tibetan-medicine practitioner. Until then it
   is research/review material, not user-facing.

4. **Scope.** Applies to `content/combinations/` now; the herb corpus moves to the
   bot-appended disclaimer too (consequence of #2). The descriptive framing of
   herbs is unchanged otherwise.

## Consequences

- The corpus will contain prescriptive source text (indications, usage, possibly
  dosing). This is **intentional and acceptable only in staging**, behind the gate.
- `CLAUDE.md`'s "Informational, not medical advice" section must be amended to record
  this exception and the production gate (done in Plan 002 Phase 1).
- The bot render path gains a single disclaimer-append step; content loses the
  per-page disclaimer (loader/validation expectations updated).
- A **doctor content-policy review** becomes a required, tracked pre-production step.
  Findings may prune or reword records — the schema must make that easy (structured
  fields + provenance `sources`).
- Reversible: if the gate review rejects the verbose approach, records can be
  re-sanitised back toward ADR 005's `themes`-only shape.

## Alternatives considered

- **Keep descriptive-only (ADR 005)** — rejected: the owner wants full data for
  expert review; stripping it pre-empts the doctor's judgement.
- **Per-page disclaimer** — rejected: a single shared disclaimer was requested and
  is easier to keep consistent.
- **Ship verbose straight to production** — rejected: violates the medical-content
  invariant without the human gate that justifies the override.

## References

- Plan 002 (`docs/plans/002-verbose-formula-reextraction.md`)
- ADR 005 (combinations type), ADR 002 (content in markdown / disclaimer)
- `CLAUDE.md` — "Informational, not medical advice"
