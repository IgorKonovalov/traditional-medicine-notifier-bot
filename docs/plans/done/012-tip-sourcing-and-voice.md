# Plan 012 — Tip sourcing reconciliation + content voice tightening

**Status:** Completed
**Created:** 2026-06-28
**Approved:** 2026-06-28 (scope incl. voice rewrite — owner)
**Completed:** 2026-06-29 (v0.12.0)
**Bump on close:** minor (visible tip-body rewrites; citation changes ride along)

## Context

Two threads converge in one pass over the tip corpus.

**(A) Sourcing.** A new authoritative source book — **«Наука о здоровье. Сова
Ригпа»** (Dr. **Ринчен Тензин**, comp. Т. Расторгуева, 2-я ред. 2015; free for
non-commercial use w/ attribution to sowa-rigpa.ru) — entered `research/`. Clean
UTF-8 text (the PDF font layer is broken — `pdftotext` drops Cyrillic; recovered
with **PyMuPDF**) lives gitignored at `research/_private/nauka-zdorovye-text.txt`;
provenance in `research/README.md`. It is a citable, authored popularization of
the same **Сова Ригпа** tradition the existing «Сова Ригпа» tips paraphrase. This
exposed two corrections to **Plan 005**: a stale citation string
(`work: Сова Ригпа (manla.ru)` was prescribed but never shipped — all files use
bare `Сова Ригпа`), and the opportunity to **re-cite tips `031–060`** to the
book's real chapters where the material matches (owner-confirmed).

**(B) Voice.** The current tip bodies read **too soft / "new-age"** — not like a
medical tradition. Across **both** sources (Чжуд-ши and Сова Ригпа) the same tells
recur: every clause double-hedged («связывают с», «относят к», «считают»,
«ценят»); technical terms wrapped in scare-quotes («согревающим», «гасит»,
«слизи»); mechanism replaced by vibe ("созвучие стола с сезоном", "мягкая
ежедневная опора"); the nyepa, the digestive fire and the heats rarely named. The
owner wants a **stricter, source-faithful, clinical register** — "raw and close to
the source material."

The key design principle: **register, not stance.** The rewrite changes *how it
reads* (clinical, direct, named mechanisms, source vocabulary) — it must **not**
change *what it claims about the reader*. Every tip stays a third-person
description of what the tradition/text holds; it never becomes an instruction,
diagnosis, or dosage to the user. Those two axes are orthogonal — holding the
stance fixed is what keeps "more medicine-like" from drifting into prescription
and breaking the **non-medical-advice invariant**.

Both threads touch the same files, so they ship as **one pass per tip**: re-cite
(30 files) + voice-rewrite (all 60). The voice spec produced here becomes a
**binding content-curator convention** that **Plan 013** and **Plan 006** (guides)
adopt from the start.

**Related:** corrects **Plan 005** (done); defines the voice convention inherited
by **Plan 013** and **Plan 006**; reuses `TipSource` (`work`/`part`/`chapter`)
from **Plan 003**; honours **ADR 002** (renderer-agnostic; `Источник:` built by
`formatTipSource`, `src/bot/messages.ts:20`), honest-sourcing, and the
non-medical-advice invariant. **No code/schema/type change.**

## Goals / Non-goals

- **Goals:**
  - **Voice spec** (content-curator ref): a concrete, example-driven definition of
    the source-faithful clinical register — do/don't list + ≥2 before→after
    samples — owner-approved (Phase 1) before any bulk rewrite.
  - **Rewrite all 60 tip bodies** (`tip-001..060`) into that register: named
    mechanisms and source vocabulary, one attribution not ten, scare-quotes only
    where genuinely figurative, filler cut — **stance unchanged** (descriptive,
    no reader-directed advice/dosing; existing medical caveats retained).
  - **Lock the book citation convention** and **re-cite tips `031–060`** to real
    «Наука о здоровье» chapters where the topic matches; keep otherwise.
  - **Correct Plan 005** with a post-completion reconciliation note.
  - Regenerate `content/.index/tips.json`; `content:index:check` green.
- **Non-goals:**
  - **No new tips, no new content type, no code/schema change.**
  - No change to tip selection/rotation or the proactive budget gate (ADR 004).
  - No re-citing of the Чжуд-ши tips' chapters — they already carry precise tantra
    citations; they get the **voice** pass only, not a re-cite.
  - No guide authoring — that is **Plan 013** (which inherits the voice spec).
  - No softening of the medical-caveat lines (e.g. the fasting tip's
    "после совета с врачом" stays — that is stance, not soft register).

## Voice spec (to finalize & owner-approve in Phase 1)

**Target register:** reads like a concise note *describing a medical system*, not
a wellness blog. Direct, technical, source-faithful.

**Do:**
- **Name the mechanism.** Use the tradition's own machinery: the three nyepa
  **Ветер / Желчь / Слизь** (gloss the Tibetan once where useful: rlung / mkhris-pa
  / bad-kan), **пищеварительный огонь** (me-drod), the **Жар / Холод** duality, the
  named heats — matching the corpus and the Plan 006 fundamentals guide.
- **Attribute once, then state plainly.** Open with the source
  ("По Чжуд-ши…", "В тибетской медицине…") and then make declarative statements,
  rather than re-hedging every clause.
- **State the principle.** Where the source gives one (e.g. *лечение
  противоположным* — balance a quality by its opposite), name it.
- **Keep it tight.** ≤ ~900 chars body; cut editorializing ("логика тут не в
  строгих запретах…", "мягкая ежедневная опора").
- **One leading emoji** per tip (owner-locked) — a single topic emoji at the start
  of the body; no further emoji decoration.
- **Terminology = sparing first-use gloss** (owner-locked): Russian corpus terms
  headline (Ветер / Желчь / Слизь, Жар / Холод, пищеварительный огонь); the
  Tibetan in parens **once**, only where it adds value — e.g. «Ветер (rlung)»,
  «Слизь (бекен)». Not regular transliteration through the body. Keep **Жар** the
  heat-*nature* (don't gloss it as mkhris-pa); gloss only the nyepa.

**Don't:**
- **No second-person imperatives / regimens / dosages.** Never "ешьте X",
  "принимайте при Y", quantities, or "если у вас Z, то…". Describe the system, not
  the reader's treatment. (This is the invariant; it overrides "rawness".)
- **No scare-quotes on established terms.** Жар, Слизь, пищеварительный огонь are
  terminology, not euphemisms — write them plain. Reserve «…» for genuinely
  figurative use.
- **No hedge-stacking.** One attribution per tip, not one per sentence.
- **No new-age abstractions** ("баланс/гармония/созвучие" as filler).

**Compliance stays via stance, not softness:** the descriptive frame ("традиция
считает…") is retained at the *tip level* (one clear attribution), so dropping
per-clause hedging does not make a tip read as advice.

## Phases

### Phase 1 — Finalize & approve the voice spec
*Owner: content-curator (architect drafts samples; **owner approves register**).*
- **Register locked (2026-06-28).** Owner reviewed before→after samples for
  tip-001 (Чжуд-ши), tip-035 (Сова Ригпа) and tip-042 (fasting; caveat survived)
  and approved the clinical register. Two knobs decided: **keep one leading
  emoji**; **sparing first-use Tibetan gloss** (both folded into the spec above).
- **Remaining deliverable:**
  - Confirm the book `part` citation string (proposed:
    `«Наука о здоровье» (Ринчен Тензин)`).
- **Acceptance:** `part` string fixed; spec captured for the curator. (Sample
  register already owner-approved.)

### Phase 2 — Build the re-cite map (tips 031–060)
*Owner: content-curator (architect sign-off).*
- **Deliverables:** a `tip-id → book chapter (or "keep, no clean match")` table,
  each remap citing the page/section in `nauka-zdorovye-text.txt` that supports it,
  each keep saying why no chapter fits.
- **Acceptance:** every tip 031–060 has a decision; map reviewed.

### Phase 3 — One pass per tip: voice rewrite + re-cite
*Owner: content-curator.*
- **Deliverables:**
  - Rewrite **all 60** bodies to the approved register.
  - Apply the Phase-2 re-cites to the `source` block of the remapped tips
    (book `part` + real `chapter`); leave "keep" citations untouched.
  - YAML colons quoted; ids/bodies self-contained; no baked-in `Источник:` line.
- **Acceptance:** spot-read of ≥10 tips (mixed sources) confirms the clinical
  register **and** zero reader-directed advice/dosing; every
  prescriptive-derived tip still carries its caveat; remapped citations render a
  clean single `Источник:` line.

### Phase 4 — Index regen, convention capture & close
*Owner: content-curator → architect (close).*
- **Deliverables:**
  - `npm run content:index`; `content:index:check` green.
  - Record the **voice spec** and the **book citation convention** in the
    content-curator refs (`conventions.md`) — binding on all future tips/guides.
  - Append the **reconciliation note** to `docs/plans/done/005-expand-daily-tips.md`.
  - Full gate run; **minor** bump; `CHANGELOG.md`; a `versionAnnouncements` entry
    (plain Russian, e.g. «Обновили формулировки советов — точнее и ближе к
    источнику»); move plan to `done/`.
- **Acceptance:** 60 tips in the index, no drift; all gates green; spec + citation
  convention recorded; Plan 005 carries the note.

## Risks / Open questions

- **"Raw" vs. the non-medical-advice invariant — the headline risk.** Stripping
  hedges is the exact move that can turn description into instruction. Mitigation:
  the register shift is **stance-preserving** (one tip-level attribution kept; no
  second-person imperatives/dosing); Phase 1 proves it on a prescriptive sample;
  Phase 3 acceptance re-checks every prescriptive-derived tip. The invariant wins
  any conflict with "rawness".
- **Subjectivity of "medicine-like enough".** A 60-file rewrite is costly to
  redo, so the register is **locked on owner-approved samples in Phase 1** before
  any bulk work (dry-run-before-bulk).
- **Terminology accessibility.** Heavy Tibetan jargon could make a daily tip
  opaque. **Resolved (owner-locked):** Russian corpus terms headline
  (Ветер/Желчь/Слизь, Жар/Холод, пищеварительный огонь); Tibetan glossed sparingly
  on first use only.
- **Honest-sourcing on re-cite.** Re-cite to the book only where it genuinely
  covers the point; otherwise keep. Phase-2 map makes this explicit per tip.
- **Cross-source consistency.** Чжуд-ши tips are terse/aphoristic; Сова Ригпа
  (book) is lecture-technical. Both rewrite toward the same clinical register, but
  each stays faithful to its own source's diction.
- **Emoji.** Resolved (owner-locked): **keep one leading emoji** per tip; no
  further emoji decoration.

## Verification

- `npm run content:index && npm run content:index:check` — 60 entries, no drift.
- `npm run typecheck && npm run lint && npm test && npm run build` — green.
- `git diff content/tips/` — citation changes confined to `source:` blocks; body
  changes are voice-only (no new claims, no dosing/imperatives introduced).
- Spot-render mixed tips: `🌿 Совет дня` + body + a single `Источник: …` line.
- Manual read of every prescriptive-derived tip (fasting, mono-diets, weight,
  intimacy) against the non-medical-advice rule.

## Progress

- [x] Phase 1 — Voice spec & register owner-approved; emoji + terminology knobs locked. `part` string locked 2026-06-28: `«Наука о здоровье» (Ринчен Тензин)`.
- [x] Phase 2 — Re-cite map built & owner-approved (20 re-cite · 10 keep): `research/_private/plan-012-recite-map.md`.
- [x] Phase 3 — All 60 bodies rewritten to the clinical register; 20 re-cites applied; caveats survived; terminology normalised (Желчь/ньепа). Gates green (166 tests).
- [x] Phase 4 — Index regen ✓, conventions captured ✓, Plan 005 note ✓, minor bump v0.12.0 + CHANGELOG + versionAnnouncements ✓, moved to `done/`.
