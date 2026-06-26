# Plan 005 — Greatly expand the daily-tip pool (Чжуд-ши + manla.ru)

**Status:** Approved — not started
**Created:** 2026-06-26
**Approved:** 2026-06-26
**Bump on close:** minor (user-facing content)

## Context

The daily-tip pool currently holds **10 tips** (`tip-001..tip-010`), all
paraphrased from the **«Чжуд-ши»** (Four Tantras), Тантра объяснений, each
carrying the structured `source` block introduced by **Plan 003**. The proactive
dispatch rotates them by local day (`pickDailyTip` → `tips[dayIndex % length]`,
`src/index.ts`), so with only 10 tips a subscriber sees the whole set repeat
every 10 days — too short for a feature meant to feel fresh.

This plan **greatly expands the pool to ~60 tips (+50)** by mining two sources:

1. **Main source — «Чжуд-ши»** (the established authority for the existing
   tips): harvest further chapters of Тантра объяснений (and other tantras where
   the topic fits) beyond the handful already used.
2. **Secondary source — `https://manla.ru/info/`**: a single rich Sova-Rigpa
   page of nutrition (питание, вода, несовместимая пища, голодание, как
   похудеть…) and behavior (повседневное поведение, сон, водные процедуры,
   физическая активность…) sections. It draws on the same tradition, so it
   complements rather than contradicts the Чжуд-ши material.

A ~60-tip pool yields a ~2-month no-repeat rotation.

**This is a pure content-authoring plan — no code, schema, or type changes.**
Per the scoping decisions below, manla.ru tips reuse the **existing**
`TipSource` shape (`work`/`chapter`), so `types.ts`, `loader.ts`, and
`index-builders.ts` are untouched; only `content/tips/*` and the regenerated
`content/.index/tips.json` change.

**Related:** builds directly on **Plan 003** (structured tip `source`, done);
governed by the content-curator **non-medical-advice invariant** (CLAUDE.md,
content-curator Rule 1) and **honest-sourcing** (Rule 2); **ADR 002**
(renderer-agnostic content — the `Источник:` line is formatted by the bot at
render time, never baked into the body).

## Scoping decisions (owner-confirmed)

- **Scale:** ~60 tips total (+50).
- **Prescriptive manla sections** (как похудеть, голодание/пост, моно-диеты,
  секс): **included**, but reframed strictly descriptively ("в традиции
  считают…", never instruction/dosing). Subject to extra review scrutiny.
- **Citations:** **reuse the existing `work`/`chapter` fields** — no `url` field,
  no schema change. manla tips set `work` + `chapter` (convention below).
- **Categorization:** new tips stay **uncategorized** (`category` omitted). The
  category set (herb-only subscription keys) is not touched.

## Goals / Non-goals

- **Goals:**
  - Grow `content/tips/` from 10 to **~60** well-formed, self-contained Russian
    tips, each ≤ ~900 chars (Telegram-friendly; existing tips run ~1.0–1.4 KB
    file incl. frontmatter).
  - Every new tip carries a structured `source` block (Plan 003 shape).
  - Faithful, **descriptive** framing throughout; prescriptive manla topics
    reframed, never presented as advice/dosing.
  - Regenerate `content/.index/tips.json`; `content:index:check` green.
  - Record the manla citation convention + any new authoring conventions in the
    content-curator skill refs (living-document rule).
- **Non-goals:**
  - **No code/schema/type change** — no `url` field, no loader/index-builder
    edits, no new categories.
  - No change to tip **selection/rotation** logic or the proactive budget gate
    (ADR 004).
  - No new bot command, per-topic digest, or tip-filtering UI.
  - No expansion of herbs/combinations; no Chinese (TCM) tips in this pass unless
    a Чжуд-ши/manla topic naturally yields one (Tibetan-tradition focus).
  - No verbatim pasting from manla.ru — paraphrase in our own words (Rule 2).

## Citation conventions

- **Чжуд-ши** (unchanged from Plan 003):
  ```yaml
  source:
    work: Чжуд-ши
    part: Тантра объяснений
    chapter: гл. NN «Название главы»
  ```
- **manla.ru** (reuse fields, no URL):
  ```yaml
  source:
    work: Сова Ригпа (manla.ru)
    chapter: раздел «Питание согласно конституции»
  ```
  Rationale: `formatTipSource` (`src/bot/messages.ts:19`) renders
  `Источник: «{work}», {chapter}` and **omits absent parts**, so a
  `work`+`chapter`-only block renders cleanly with no `part`. Using
  `Сова Ригпа (manla.ru)` rather than a bare `manla.ru` reads better inside the
  «…» guillemets and names the tradition; the section name goes in `chapter`.
  **Confirm this exact `work` string with the owner during Phase 1** before
  authoring all manla tips, so the citation is uniform.

## Phases

### Phase 1 — Source harvest & tip outline
*Owner: content-curator (with architect sign-off on the outline).*
- **Deliverables:**
  - Read `content/.index/tips.json` for existing ids/chapters to **avoid topical
    duplication** with tip-001..010.
  - Build a **tip outline**: ~50 candidate tips as a table of
    `proposed-id | source (Чжуд-ши ch. / manla section) | one-line topic`.
    Target a rough balance (e.g. ~25 Чжуд-ши, ~25 manla) and spread across
    nutrition **and** behavior so the rotation feels varied.
  - Flag every prescriptive-manla candidate (как похудеть, голодание/пост,
    моно-диеты, секс) in the outline so reframing gets deliberate review.
  - Lock the manla `work` citation string with the owner.
- **Acceptance:** outline reviewed; no topic collides with an existing tip;
  prescriptive items flagged; citation string fixed.

### Phase 2 — Author the Чжуд-ши tips (~25)
*Owner: content-curator.*
- **Deliverables:**
  - New `content/tips/tip-0NN-<slug>.md` files paraphrased from further
    Тантра-объяснений chapters (and other tantras where apt), each with a
    Чжуд-ши `source` block, ids continuing the existing zero-padded sequence.
  - Descriptive Russian prose, self-contained, ≤ ~900 chars body; tasteful
    leading emoji consistent with existing tips; **no** baked-in `Источник:`
    line (rendered by the bot) and **no** dosing/instructions.
- **Acceptance:** files validate via loader on `npm run content:index`; spot-read
  shows faithful, descriptive framing; ids unique and sequential.

### Phase 3 — Author the manla.ru tips (~25)
*Owner: content-curator.*
- **Deliverables:**
  - New tip files paraphrased from manla.ru/info sections, each with the agreed
    manla `source` block (Phase 1 string + section in `chapter`).
  - **Prescriptive sections reframed**: weight-loss/fasting/mono-diet/sexual-health
    rendered as "в тибетской традиции считают…" descriptive notes — never an
    instruction, regimen, or dosage. Where a section cannot be made safely
    descriptive, **drop it** and note the omission to the owner.
  - No verbatim copying — paraphrase; carry over only factual identifiers.
- **Acceptance:** files validate; **every prescriptive-derived tip passes the
  non-medical-advice check** (no imperative regimens/dosing); citations uniform.

### Phase 4 — Index regen, convention capture & validation
*Owner: content-curator → architect (close).*
- **Deliverables:**
  - `npm run content:index` to regenerate `content/.index/tips.json`;
    `npm run content:index:check` green (no drift).
  - Update content-curator refs (`schema.md` / `conventions.md`) with the manla
    citation convention and the descriptive-reframing note for prescriptive
    source material (living-document rule).
  - Full gate run; semver **minor** bump; `CHANGELOG.md` entry; move plan to
    `done/`.
- **Acceptance:** ~60 tips present in the index; all gates green; conventions
  recorded.

## Risks / Open questions

- **Non-medical-advice invariant is the headline risk.** The prescriptive manla
  sections are the most likely to drift into instruction/dosing. Mitigation:
  Phase 1 flags them; Phase 3 acceptance explicitly checks each; drop anything
  that can't be made descriptive. This invariant overrides coverage targets.
- **Source fidelity / honest sourcing.** manla.ru is a commercial clinic site;
  its claims must be attributed to the *tradition*, not stated as clinical fact,
  and **paraphrased** (Rule 2). Do not import manla's marketing tone.
- **Topical overlap between sources.** Чжуд-ши and manla cover the same ground
  (seasonal eating, water, meal timing). Phase 1's outline must de-duplicate so
  two tips don't say the same thing with different citations.
- **manla `work` citation string** is the one open question — recommended
  `Сова Ригпа (manla.ru)`; confirm in Phase 1 before bulk authoring to avoid a
  rename pass.
- **Rotation is index-order, not shuffled.** A larger pool lengthens the cycle
  but `dayIndex % length` still walks tips in id order. True shuffling is out of
  scope (separate effort); acceptable for this plan.
- **No `url` means manla tips aren't click-through.** Accepted per scoping; a
  future plan can add an optional `url` to `TipSource` if linking is wanted.

## Verification

- `npm run content:index && npm run content:index:check` — regenerates without
  drift; ~60 entries in `tips.json`.
- `npm run typecheck && npm run lint && npm test && npm run build` — green
  (no code changed, but confirms the corpus still loads at boot).
- Spot-render: pick a Чжуд-ши tip and a manla tip; confirm
  `messages.tip.daily` produces `🌿 Совет дня` + body + a clean single
  `Источник: «…», …` line (manla line has no `part`).
- Manual read of every prescriptive-derived tip against the non-medical-advice
  rule.

## Progress

- [ ] Phase 1 — Source harvest & tip outline (incl. manla citation string)
- [ ] Phase 2 — Author ~25 Чжуд-ши tips
- [ ] Phase 3 — Author ~25 manla.ru tips (prescriptive sections reframed)
- [ ] Phase 4 — Index regen, convention capture, validation & close
