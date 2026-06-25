# Plan 002 — Verbose formula re-extraction (doctor-gated)

**Status:** Approved
**Created:** 2026-06-25
**Completed:** —
**Bump on close:** minor

## Context

Plan 001 shipped 144 **descriptive-only** combination records (indications stripped,
disclaimer baked per page). The owner has changed the policy (ADR 006): capture the
**richest possible** source data — original indications, traditional usage, source
text — for **expert review by a Tibetan-medicine practitioner before production**,
and use a **single bot-appended disclaimer** instead of per-page text.

This plan re-extracts the corpus verbosely under that new policy. The verbose corpus
is a **staging artifact behind a human production gate** (ADR 006 §3).

Decisions locked (2026-06-25): re-crawl **full verbatim text**; store as **structured
fields + body**; **single global disclaimer appended by the bot**; Дакнанг line +
kits + pill-grinder **stay excluded** (Plan 001 upheld); production gate is
**owner-managed** (no in-code `reviewed` flag — the owner reports review readiness);
Telegram message splitting is **out of scope** (a separate effort, modelled on
`serbian-language-bot`'s long-lesson splits).

Related: ADR 006 (governing), ADR 005 (superseded for combinations), ADR 002 (amended).

## Goals / Non-goals

- **Goals:**
  - ADR 006 recorded (done); `CLAUDE.md` amended to state the staging exception +
    production gate + single-disclaimer rule.
  - Extend the `Combination` schema with verbose fields (indications, usage,
    full source text) alongside the existing structured fields.
  - Move the disclaimer to a **single bot-appended** step (herbs + combinations);
    drop per-page disclaimer from content.
  - Re-crawl every source detail page for **full verbatim** text + structured data;
    persist the verbose raw dataset under `research/`.
  - Re-author all combination records verbosely (no sanitisation), index regenerated.
  - A **doctor-review handoff** artifact + a tracked production-gate sign-off step.

- **Non-goals:**
  - Shipping verbose content to the **production** bot (blocked on doctor sign-off).
  - Bot UX for browsing combinations (still a separate follow-up).
  - Cross-source verification against other corpora (noted as a future follow-up).

## Phases

### Phase 1 — Policy, schema & disclaimer infra
*Owner: architect (CLAUDE.md/ADR) → dev (code).*

- **Deliverables:**
  - Amend `CLAUDE.md` "Informational, not medical advice": record the ADR 006
    staging exception, the production gate, and the single-disclaimer rule.
  - `src/content/types.ts` — extend `Combination` with verbose fields, e.g.
    `indications: string[]`, `traditionalUse: string[]`, `sourceText?: string`
    (full verbatim), `dosingNotes?: string[]`; `themes` becomes optional.
  - `loader.ts` / `validate.ts` — parse new fields; **drop** the per-page-disclaimer
    expectation; keep composition non-empty only where applicable (see Phase 2 for
    composition-less records — may relax to allow them now).
  - `index-builders.ts` — extend the index entry if useful (e.g. `hasIndications`).
  - Bot: a single disclaimer-append in the render path (`render/markdown.ts` or the
    herb command) sourcing `messages.disclaimer`; remove baked disclaimer from
    existing herb + combination content.
  - Tests for the new fields + the render append.
- **Acceptance:** gates green; a record with verbose fields and no baked disclaimer
  loads; the bot appends exactly one disclaimer to a herb page.

### Phase 2 — Full verbatim re-crawl
*Owner: dev/research, batched workflow fan-out.*

- **Deliverables:**
  - Re-fetch every detail page (manla anchors + all bimala targets) capturing the
    **full verbatim source description** plus structured `indications`,
    `traditionalUse`, `dosingNotes`, `cautions`, `composition`, `sources`.
  - Repair the manla shortfall (target full 53) and capture the 11 composition-less
    formulas' text. Дакнанг line, kits, and the pill-grinder **remain excluded**.
  - Persist the verbose raw dataset to `research/raw-crawl-verbose.json`.
- **Acceptance:** coverage log shows every targeted formula captured (or logged as
  unreachable); verbatim text present for the classical set.

### Phase 3 — Verbose authoring & integration
*Owner: content-curator / deterministic render.*

- **Deliverables:**
  - Render all records to `content/combinations/*.md` with structured verbose fields
    + a readable body, **no sanitisation**, **no baked disclaimer**.
  - Preserve canonical `tib-formula-*` ids; regenerate `content/.index/`.
- **Acceptance:** loader boots; `content:index:check` green; spot-check fidelity vs
  source pages.

### Phase 4 — Doctor-review handoff & production gate
*Owner: architect + owner.*

- **Deliverables:**
  - A review-friendly export for the practitioner (single document or per-formula
    structured view) listing source claims for sign-off.
  - A tracked gate record (e.g. `docs/medical-review.md`) capturing review status per
    formula; nothing flips to production-eligible without it (ADR 006 §3).
- **Acceptance:** export generated; gate doc in place; review status = pending until
  the doctor signs off.

### Phase 5 — Validation & close
- Gates + coverage report; CLAUDE.md/ADR/architecture refreshed; minor bump.

## Risks / Open questions

- **Production-gate enforcement is owner-managed (decided).** No in-code `reviewed`
  flag for now — the verbose corpus stays non-production until the owner reports the
  doctor's review is done and how to apply it. Keep verbose content out of any
  production-surfaced path until then (procedural).
- **Дакнанг / kits — excluded (decided).** The modern Дакнанг line, bundled kits, and
  the pill-grinder remain out of scope, as in Plan 001.
- **Verbatim text volume — out of scope (decided).** Pages will exceed Telegram's
  ~3800-char limit; capture the full data now regardless. Message splitting is a
  separate effort modelled on `serbian-language-bot`'s long-lesson split mechanism,
  to be planned when combinations are surfaced.
- **Reversibility:** ADR 006 keeps the descriptive `themes` shape recoverable if the
  doctor review prunes the verbose data.
- **Follow-up — cross-source verification:** check composition/indications against
  independent corpora once the verbose base exists.

## Verification

- `npm run typecheck && npm run lint && npm test && npm run build` — green.
- `npm run content:index && npm run content:index:check` — no drift.
- Loader boots with verbose fields and no baked disclaimer; bot appends exactly one
  disclaimer at render.
- Doctor-review export generated; production-gate doc tracks per-formula status.

## Progress

- [ ] Phase 1 — Policy, schema & disclaimer infra
- [ ] Phase 2 — Full verbatim re-crawl
- [ ] Phase 3 — Verbose authoring & integration
- [ ] Phase 4 — Doctor-review handoff & gate
- [ ] Phase 5 — Validation & close
