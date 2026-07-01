# Plan 026 — Guides on the tradition's own frame (round-2 wave 1)

**Status:** Approved — 2026-07-01 (owner sign-off; implementation not yet started)
**Created:** 2026-07-01
**Completed:** —
**Bump on close:** minor (new user-facing content)

## Context

The standing `docs/plans/guide-backlog.md` round-1 menu (groups A–D + elderly
nutrition) is **fully consumed** — 35 Tibetan guides ship today (Plan 006 infra +
flagship, Plan 013, Plan 016, Plan 020's 27-guide sweep). Actualising the backlog
(2026-07-01) added a **round-2 menu** drawn from what those 35 leave untapped.

The shipped corpus is thick on **diet, conduct, disease-taxonomy, physiology, and
constitution portraits**, and diagnosis (pulse/urine/tongue/questioning) is fully
covered by `tib-nablyudenie-tela`. The clear **gap** is the tradition's own
**structure, origin, therapeutic method, and pharmacy** — the guides explain the
tradition's *content* but never its *shape*. This plan authors the round-2
**Group E** wave that fills that gap: four framing-safe, iconic guides.

This plan adds **no infrastructure** — the guide content type, the `📖 Статьи`
browse branch, pager delivery, and render-time disclaimer all shipped in Plan 006
(ADR 008). It is **pure content authoring** (content-curator) + index sync, exactly
like Plan 020.

**Framing rule ([[guide-framing-scope]], ADR 006):** the non-medical-advice
invariant gates **medical** prescriptions only — disease diagnosis/treatment and
herb/formula **dosing**. These four guides are descriptive/structural and carry
**zero** prescription, but two rows have a hard sourcing caveat baked into the
acceptance criteria below (draw the *structure/framework* only, never the remedy
lists the same chapters happen to contain). Hard exclusion stands: the **Тантра
наставлений** treatment protocols are never a source.

Related: ADR 008 (guides), ADR 006 (non-medical framing), Plan 006/016/020
(precedent + infra), `guide-backlog.md` round-2 Group E (source rows + canon
citations), [[target-audience-and-voice]], [[guide-voice-soft-prose-antipatterns]].

## Goals / Non-goals

- **Goals:**
  - Author the **4 Group-E guides** as `content/guides/tibetan/<id>.md`, following
    the established guide schema (frontmatter `id`/`tradition`/`order`/`title`/
    `source`/`tags`, body split on `##` headings) and the source citations in
    `guide-backlog.md` round-2 Group E.
  - Hold descriptive/structural framing; honour the two "structure only" caveats.
  - Tick each authored row back in `guide-backlog.md` (round-2 consumed list).
  - Keep `content/.index/guides.json` in sync; all gates green.
  - Cross-link where natural (the pharmacy-forms guide ↔ the live 🧪 Составы /
    `rinchen-pills` branch; the tree/origin guides ↔ `tib-osnovy`) without
    duplicating existing guides.

- **Non-goals:**
  - Groups F (prognosis/ethics) and G (rebalance-by-начало) — left on the round-2
    menu for a later wave.
  - Diagnosis guides — already covered by `tib-nablyudenie-tela`.
  - External procedures (moxa/bloodletting/compresses), instruments — excluded/
    deferred per the round-2 menu.
  - Any material from the Тантра наставлений (Том III) treatment protocols, or the
    specific drug/purge lists inside Root гл. 5 / Explanatory гл. 27–30.
  - Infra/UX changes to the guide branch — none needed.
  - Chinese-tradition guides (deferred by decision, ADR 008 scope note).

## Phases

Single authoring wave, committed as one reviewable batch. Each row lists a
**proposed id slug** (final wording by content-curator) and its framing flag.

### Phase 1 — Group E: the tradition's own frame (4 guides)

- **Deliverables:**
  - `tib-drevo-mediciny` — **Древо тибетской медицины** ✅ ★ — the three-root /
    stem / branch / leaf allegory (Тантра основ гл. 6). Body–diagnosis–treatment
    as a tree; the structural map the rest of the corpus hangs on.
    **Caveat:** draw the diagram's *structure* only — гл. 5 «Средства лечения»
    names specific herbs/purges; those never enter the guide.
  - `tib-istoki-i-razdely` — **Истоки и разделы тибетской медицины** ✅ ★ —
    origin of Сова Ригпа and the four tantras of Чжуд-ши (основ / объяснений /
    наставлений / дополнительная) and what each holds (Наука «Истоки и разделы» +
    canon front-matter «Тибетская медицина и трактат „Чжуд-ши"»).
  - `tib-chetyre-sposoba-lecheniya` — **Четыре способа лечения** ✅ — the
    therapeutic hierarchy питание → образ жизни → лекарства → процедуры and why
    the tradition always begins with food and regimen (Тантра объяснений гл. 27).
    **Caveat:** the *framework* only — drop the гл. 27–30 drug/purge specifics.
  - `tib-vidy-lekarstvennyh-form` — **Виды лекарственных форм** ✅ — taxonomy of
    remedy *forms* (отвары, порошки, пилюли, масляные/зольные лекарства, кханда,
    лечебные вина-чханг, ринчен-составы из драгоценностей, травяные составы;
    Дополнительная тантра Сутра 2, объяснений гл. 21). Cross-links to the live
    🧪 Составы / `rinchen-pills` corpus.
    **Caveat:** describe *what the forms are*, **never dosing**.

- **Acceptance:**
  - 4 files validate (`parseGuide`): unique ids, `tradition: tibetan`, non-empty
    ordered sections, quoted colon-bearing frontmatter values.
  - `npm run content:index` regenerates; `guides.json` grows by exactly 4; no
    unexpected drift.
  - The two caveated guides (`tib-drevo-mediciny`, `tib-chetyre-sposoba-lecheniya`)
    carry **zero** herb/formula/purge/dosing lines; `tib-vidy-lekarstvennyh-form`
    lists forms without any dose or "take X for Y".
  - Voice is clinical and source-faithful, no new-age filler
    ([[guide-voice-soft-prose-antipatterns]]): no boilerplate disclaimer paragraph
    (render-time disclaimer covers framing), no soft headings, no hedge-stacking.
  - Round-2 Group E rows ticked in `guide-backlog.md`.
  - `order` values assigned coherently (curator picks; sequential after the
    current max) — cosmetic only, not a blocker.

## Risks / Open questions

- **Overlap with `tib-osnovy`.** `tib-osnovy` covers the three начала / five
  elements / Жар-Холод vocabulary. The tree and origin guides describe the
  *tradition's structure*, not the physiology — they must reference `tib-osnovy`
  for the начала rather than restate it.
- **The two "structure only" caveats are the whole risk.** Root гл. 5 and
  Explanatory гл. 27–30 sit right next to the framework material and are full of
  named remedies and purges. The curator draws the *allegory* and the *hierarchy*,
  never the drug lists — this is the one thing review must check hardest.
- **Pharmacy-forms row proximity to dosing.** «Виды лекарственных форм» describes
  *forms* (a decoction vs a pill vs a jewel-pill) as a cultural taxonomy. It must
  not drift into "how much / how often" — that is the dosing line the invariant
  gates. Keep it at the "what these forms are and why the tradition uses each"
  altitude; the `rinchen-pills` cross-link is to the existing card, not a dose.
- **Source thinness.** «Истоки и разделы» leans on the Наука book + canon
  front-matter more than a single canon chapter; if the material proves thin,
  ship a shorter guide rather than padding.
- **Wave sizing.** Four is a deliberately tight, coherent wave (single minor bump,
  one `versionAnnouncements` entry). Groups F/G wait for a later plan.

## Verification

- `npm run content:index && git diff --stat content/.index` — `guides.json` grows
  by 4, no unexpected drift.
- `npm run typecheck && npm run lint && npm test && npm run build &&
  npm run content:index:check` — all green.
- Manual (bot): `📚 Библиотека → 📖 Статьи` lists the 4 new guides; open each and
  page through; final page carries the render-time disclaimer (ADR 006); no guide
  shows a remedy/dose/purge line.
- `guide-backlog.md` round-2 Group E "consumed" note updated for every shipped row.

## Progress

- [ ] Phase 1 — Group E (4): `tib-drevo-mediciny`, `tib-istoki-i-razdely`,
  `tib-chetyre-sposoba-lecheniya`, `tib-vidy-lekarstvennyh-form` —
