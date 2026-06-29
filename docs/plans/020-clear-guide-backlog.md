# Plan 020 — Clear the guide backlog (bulk-author remaining waves)

**Status:** Approved — 2026-06-29
**Created:** 2026-06-29
**Completed:** —
**Bump on close:** minor (single close after all waves)

## Context

The standing `docs/plans/guide-backlog.md` is a menu of Tibetan long-form guide
candidates that numbered plans draw waves from. Three plans have consumed rows so
far — **Plan 006** (infra + flagship + seasonal + daily routine), **Plan 016**
(six tastes, cause & condition), **Plan 013** (constitution portraits → diagnosis
→ `tib-tri-prirody` / `tib-nablyudenie-tela`). Eight guides are live:

`tib-osnovy`, `tib-shest-vkusov`, `tib-kak-voznikaet-bolezn`,
`tib-rasporyadok-dnya`, `tib-sezonnoe-pitanie`, `tib-sutochnyj-ritm`,
`tib-tri-prirody`, `tib-nablyudenie-tela`.

That leaves **26 unconsumed backlog rows** across the four groups (A foundations,
B disease taxonomy, C nutrition, D lifestyle) plus one "other candidate" (elderly
nutrition) — **27 guides total**. This plan **clears the remaining backlog** in
themed waves, ticking each row back in `guide-backlog.md` as it goes, and
**closes once** after all waves land (single minor bump). It is the follow-up
bulk wave Plan 006 deferred and Plan 016 Waves 2–3 punted.

This plan adds **no infrastructure** — the guide content type, the `📖 Статьи`
browse branch, pager delivery, and render-time disclaimer all shipped in Plan 006
(ADR 008). It is **pure content authoring** (content-curator) + index sync.

**Framing rule (already settled in the backlog, [[guide-framing-scope]]):** the
non-medical-advice invariant gates **medical** prescriptions only — disease
diagnosis, disease treatment, herb/formula **dosing**. Lifestyle/conduct
prescriptions (diet schedules, sleep, routine, sex, body-strengthening) are fine
even when phrased prescriptively. Disease *taxonomy* (Жар/Холод classification) is
descriptive and fine. The ⚠️ rows below keep their lifestyle/diet content and
**drop any "condition X → take remedy Y" / dosing** lines. Hard exclusion stands:
the **Тантра наставлений** treatment protocols are never a source.

Related: ADR 008 (guides), ADR 006 (non-medical framing), Plan 006/016
(precedent + infra), `guide-backlog.md` (source rows + canon/manla citations).

## Goals / Non-goals

- **Goals:**
  - Author the **26 open backlog guides** (+ optionally the elderly-nutrition
    candidate) as `content/guides/tibetan/<id>.md`, following the established
    guide schema and the source citations already in `guide-backlog.md`.
  - Organise into **4 themed waves** (A/B/C/D) + the elderly-nutrition guide as
    coherent authoring batches; **close once** after all land.
  - Tick each authored row back in `guide-backlog.md` (the "consumed" list).
  - Keep `content/.index/guides.json` in sync; all gates green.
  - Hold descriptive framing; salvage the ⚠️ rows per the framing rule.

- **Non-goals:**
  - Rows already shipped or owned by Plan 013 (питание/поведение по конституции →
    `tib-tri-prirody`; diagnosis → `tib-nablyudenie-tela`). Do not re-author.
  - Chinese-tradition guides (deferred by decision, ADR 008 scope note).
  - Any guide drawing on the Тантра наставлений treatment protocols, or
    pregnancy/children (гл. 5 — quasi-medical, excluded).
  - Infra/UX changes to the guide branch — none needed.
  - **tip→guide deep-links** (the `Tip`-mentions-guide cross-link idea, ADR 008) —
    out of scope; a separate follow-up if wanted.

## Phases (waves)

Each wave lists the backlog rows it consumes with a **proposed id slug** (final
wording by content-curator) and the framing flag. Sources are the canon chapter +
manla `/info` section already named per-row in `guide-backlog.md`.

### Wave 1 — A. Foundations & theory (5 guides)
- `tib-pishchevaritelnyj-ogon` — Пищеварительный огонь (медро) ✅ (★, Plan 016 W2)
- `tib-sem-sil-tela` — Семь сил тела и «чистый сок» ✅ (Plan 016 W3)
- `tib-princip-protivopolozhnogo` — Принцип противоположного ✅
- `tib-telo-v-obrazah` — Тело в образах традиции ✅
- `tib-zachatie-i-razvitie` — Зачатие и развитие (эмбриология) ✅
- **Acceptance:** 5 files validate; index regenerates; descriptive framing;
  rows ticked in `guide-backlog.md` group A.

### Wave 2 — B. How the tradition explains disease (4 guides)
- `tib-kak-bolezn-vhodit` — Как болезнь входит и проявляется ✅
- `tib-zhar-i-holod` — Жар и Холод — подробно (terminology, **taxonomy not
  diagnosis**) ✅
- `tib-klassifikaciya-boleznej` — Как традиция различает болезни ✅
- `tib-priznaki-uvyadaniya` — Признаки увядания тела ✅
- **Acceptance:** 4 files validate; the Жар/Холод guide reads as corpus
  terminology, never "you have X"; rows ticked group B.

### Wave 3 — C. Nutrition (8 guides)
- `tib-nesovmestimye-produkty` — Несовместимые сочетания продуктов ✅ (★)
- `tib-mera-pitaniya` — Мера питания: сколько есть ✅
- `tib-legkaya-i-tyazhelaya-pishcha` — Лёгкая и тяжёлая пища ✅
- `tib-voda-i-napitki` — Вода и напитки ✅
- `tib-masla-i-zharenie` — Масла и жарение ✅
- `tib-vremya-priema-pishchi` — Время приёма пищи ✅
- `tib-ukreplenie-i-ves` — Укрепление тела и снижение веса ⚠️ (keep diet/conduct,
  drop any remedy line)
- `tib-pitanie-pri-nesvarenii` — Питание при несварении (мукпо) ⚠️ (dietary
  regimen only; no formula prescription)
- **Acceptance:** 8 files validate; the two ⚠️ guides carry zero
  herb/formula/dosing prescription; rows ticked group C.

### Wave 4 — D. Lifestyle & conduct (9 guides)
- `tib-profilaktika` — Как жить не болея: профилактика ✅ (★)
- `tib-son` — Сон: режим и значение ✅
- `tib-aktivnost-i-otdyh` — Активность и отдых ✅
- `tib-polovaya-zhizn` — Половая жизнь в традиции ✅
- `tib-povedenie-v-chastnyh-sluchayah` — Поведение в частных случаях ✅
- `tib-vodnye-procedury` — Водные процедуры и омовения ✅
- `tib-massazh` — Массаж и масляные процедуры ⚠️ (descriptive wellness; reframe
  any "to cure X")
- `tib-uhod-za-zreniem` — Уход за зрением ⚠️ (conduct/habits only)
- `tib-o-lekare` — О лекаре: этика традиции ✅
- **Acceptance:** 9 files validate; ⚠️ guides reframed descriptively; rows ticked
  group D.

### Wave 5 — Other candidate (1 guide)
- `tib-pitanie-pozhilyh` — Питание и образ жизни пожилых (Сова Ригпа гл. 6) ✅ —
  the descoped-from-Plan-013 candidate in `README.md → Other candidates`.
  Pregnancy/children (гл. 5) stays excluded.
- **Acceptance:** file validates; conduct/diet framing; the `README.md` "Other
  candidates" entry is cleared.

## Risks / Open questions

- **Volume & cadence.** 27 guides is large but ships as **one close** (owner's
  call, 2026-06-29): author all waves, then a single minor bump + one
  `versionAnnouncements` entry (e.g. "Большое пополнение раздела «Статьи»").
  Waves remain the authoring/review batches; nothing reaches users until the
  whole backlog lands. Commit per wave to keep diffs reviewable.
- **Source coverage.** A few rows lean on manla `/info` sections more than canon
  (e.g. масла/жарение, водные процедуры). Where canon is thin, the guide stays
  shorter and manla-sourced — flag any row where material proves too thin to
  justify a guide rather than padding it.
- **Overlap with tips/foods.** Several rows have an existing tip (e.g. мера
  питания↔tip-005, вода↔tip-008) and the Foods branch covers food *properties*.
  Guides must **expand conceptually**, not restate a tip or duplicate Foods data.
- **⚠️ rows.** Four total (укрепление/ves, мукпо, массаж, зрение) — all
  salvageable per the framing rule; curator drops medical-prescription lines. If
  any row can't survive without its treatment content, strike it and note why.
- **Voice.** Practitioner audience ([[target-audience-and-voice]]) — clinical,
  source-faithful, no new-age filler.

## Verification

- `npm run content:index && git diff --stat content/.index` — guides.json grows
  by the wave's count, no unexpected drift.
- `npm run typecheck && npm run lint && npm test && npm run build &&
  npm run content:index:check` — all green.
- Manual (bot): `📚 Библиотека → 📖 Статьи` lists the new guides; open one and
  page through; final page carries the render-time disclaimer (ADR 006); a ⚠️
  guide shows no remedy/dosing line.
- `guide-backlog.md` "consumed" list updated for every shipped row.

## Progress

- [x] Wave 1 — A. Foundations (5) — `tib-pishchevaritelnyj-ogon`,
  `tib-sem-sil-tela`, `tib-princip-protivopolozhnogo`, `tib-telo-v-obrazah`,
  `tib-zachatie-i-razvitie` (digestive-fire re-sourced гл. 16→гл. 5)
- [ ] Wave 2 — B. Disease taxonomy (4)
- [ ] Wave 3 — C. Nutrition (8, incl. 2 ⚠️)
- [ ] Wave 4 — D. Lifestyle (9, incl. 2 ⚠️)
- [ ] Wave 5 — elderly nutrition (1)
