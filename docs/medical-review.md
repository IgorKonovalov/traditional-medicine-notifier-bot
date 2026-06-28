# Medical review gate (ADR 006)

**Status: PARTIAL sign-off — owner-managed.** The verbose Tibetan-formula corpus
under `content/combinations/` is a **staging artifact**. Per ADR 006, **none of it
may reach the production bot** until a qualified Tibetan-medicine practitioner has
reviewed it and the owner has signed off. **As of 2026-06-28 the owner has approved
the _minimal_ library UI surface** (formula browser showing name / nature /
composition / member cross-links / themes / cautions only — Plan 009, gate lifted);
the **verbose fields remain unsurfaced and unapproved** (see Sign-off table). The
owner will report when the verbose-field review is complete.

## Fidelity re-audit & remediation (Plan 004, 2026-06-26)

A practitioner reviewed the corpus and found the prior extraction had **condensed
and paraphrased** the sources, dropping sentences and indications. Plan 004
remediated this and **regenerated the review HTML** for the next re-audit round.
What changed since the sections below were written:

- **Corpus 161 → 150.** The 11 genuinely composition-incomplete formulas were
  removed; the 6 prose-composition ones stay.
- **Source fidelity restored.** Every surviving formula was **re-captured verbatim**
  from its authoritative source (manla.ru for the 53 manla formulas; each bimala
  detail page for the 97 bimala-only) into **`research/raw-crawl-verbose-v2.json`**
  — now the authoritative provenance. The old `raw-crawl-verbose.json` is **not**
  faithful and is retained only for history. (Diagnosis: the earlier "verbatim
  re-crawl" was LLM-mediated and condensed each section — see Plan 004 "Phase 2
  diagnosis".)
- **Dual-source = manla-canonical (owner decision).** For the 47 formulas with both
  sources, manla is authoritative and bimala's extra/commercial indications were
  **dropped** — superseding the "Dual-source consolidation" analysis below (now
  historical). Each record's body is the verbatim manla section.
- **Structured `nature`** («Сущность») recovered for 66 formulas; **rinchen category**
  (`rinchen-pills`, 8 formulas) added (ADR 007).
- **Normalization:** ingredients are Russian-first `Русское (Latin)`; caution
  boilerplate stripped (formula-specific contraindications kept); list capitalization
  normalized.

**Still needs the reviewer's eye (flagged, not resolved):**

- **5 ingredients have no confident Russian name** and stay Latin-only:
  `Bos taurus domesticus` (animal-derived), `Potamom yunnanensis` (likely a crab,
  animal), `Solms-Laubachia sp.` (genus only), `Trona` (mineral), and a stray `etc.`
- The **toxic-constituent discrepancies** flagged below (aconite vs strychnine in
  `agar-35`, `garuda-5`, `olse-25`, `tcovo-8`) **still stand** — confirm before any
  production use. **Interim mitigation (2026-06-28, v0.11.1):** a defensive
  caution («Содержит сильнодействующие компоненты — применять только под
  наблюдением врача») was added to all four `cautions` arrays — they ship in the
  live formula card — pending the verdict. `agar-35` ships *Strychnos nux vomica*
  (no aconite); `garuda-5`/`olse-25`/`tcovo-8` ship truncated compositions
  («И другие») that may hide an aconite entry. Remove/refine once the true
  constituent is confirmed (verdict shape: is the toxin nux vomica, aconite, or
  both, and should the missing aconite be listed in `composition`?).
- Best-effort Russian↔Latin ingredient mappings still need a botanist check.
- **bimala re-audit (2026-06-27).** A completeness-gated re-capture of the 97
  bimala-only formulas recovered dropped description sentences for **12** records
  (`traditional_use` updated). **6 remain flagged** — verify their description
  against the live page: `chisin-chimed-srinsel` (the fetch model paraphrased
  rather than quoted), and `aru-24`, `aru-7`, `chudlen-mandaravy`, `letre-2`,
  `senden-4` (capture self-flagged possibly incomplete). Provenance:
  `research/raw-crawl-verbose-v2-bimala-reaudit.json`.

## Review inputs

- **Corpus:** `content/combinations/*.md` (150 formulas) — structured fields
  (`indications`, `traditional_use`, `dosing_notes`, `composition`, `cautions`,
  optional `nature`/`category`) plus a verbatim `## Источник:` body. Dual-source
  formulas (47) are **manla-canonical** (Plan 004), superseding the earlier merge.
- **Raw provenance:** `research/raw-crawl-verbose-v2.json` — the faithful per-formula
  re-capture (authoritative). `research/raw-crawl-verbose.json` is the older,
  condensed crawl (history only).

## What the corpus deliberately contains (non-sanitised)

The records carry the **original source claims verbatim** — indications, treatment
language, and dosing/administration. This is intentional for review completeness,
not a bug. The review decides what, if anything, is reworded, pruned, or kept for
production. Transactional/commercial e-commerce noise (prices, stock, bonus points,
reviews, manufacturer) has been removed (see Cleanup pass); the unmerged
`research/raw-crawl-verbose.json` still holds it verbatim if needed.

## Cleanup pass (2026-06-26)

A data-cleanup pass ran over the corpus (163 → 161 formulas):

- **Duplicates merged (manla-priority):** `chongzhi-6` → `dzhonshi-6` and
  `sposkar-10` → `pokar-10` — confirmed identical-composition twins, folded into the
  bimala-id record (manla wins on the one scalar conflict, "Сущность/свойство"; both
  `## Источник:` sections and URLs retained). The remaining manla-only records
  (`lomang-8`, `lchumtsa-3`, `mkhalma-9`, `sugmel-13`, `blonpo-3`, `tsarbong-5`) have
  **no same-count bimala twin** — the number in a formula name is its ingredient
  count, so e.g. `sugmel-13` ≠ `sugmel-10`/`sugmel-7`. They stay standalone.
- **Grammar/spelling:** 106 conservative fixes across 58 files (Latin-binomial typos,
  Russian misspellings, spacing/encoding artifacts).
- **Commercial noise removed:** 192 transactional snippets across ~52 files (prices,
  stock/availability, bonus points, manufacturer, reviews, notify-on-arrival) stripped
  from both the `source_text` block scalar and the `## Источник:` bodies. Medicinal
  fields (dosage form, course weight, administration) and the explanatory
  "page had no description" notes were kept; composition-less records keep a non-empty
  `source_text`.
- **Case-agreement normalised:** 117 grammatical fixes across the corpus (wrong-case
  agreement from extraction, e.g. `при воспаления`→`при воспалении`, `на языка`→`на
  язык`; conjunction `так же`/`а так же`→`также`/`а также`).

Raw provenance in `research/raw-crawl-verbose.json` is unchanged, so every edit above
is auditable against the original crawl.

## Dual-source consolidation (2026-06-26)

The **47 formulas that carried both `bimala.ru` and `manla.ru`** were consolidated
into a **single manla-preferred record** each (the two `## Источник:` sections were
collapsed). A read-only analysis flagged 53 genuine source conflicts (38 composition,
8 dosing, 4 nature, 3 name); these were resolved with the owner via interview:

- **Composition:** use **manla's component set only**, formatted `Latin (Russian)`;
  bimala-divergent components were **dropped** (listed below for verification). The
  Russian common names paired to manla's Latin binomials are **best-effort mappings**
  and need a botanist/practitioner check.
- **Nature:** manla's value as primary, bimala noted as `(вариант bimala: …)`.
- **Dosing:** manla wins on timing conflicts; complementary bimala details kept.
- **Names:** `bimala` keeps "20" with a note that only 19 components are enumerated;
  `olse-25` keeps "25" (manla's "OL-SE 27 / PODOPHYLLUM 27" recorded only as an
  alternate catalog code); `sebru-dane` adopts manla's "прозрачный сок" (dangs-ma).

**Dropped bimala-only components (per formula) — confirm whether any are canonical:**

- `agar-15`: слива, белый сандал, сафлор красильный, звездчатка, бузина черная
- `agar-35`: слива, бузина, бомбакс сейба, ладан, зубчатка, шлемник байкальский, череда трёхраздельная, мордовник, цветы девясила, **аконит**
- `aru-10`: рододендрон золотистый, лаковые червецы
- `bimala`: акация катеху, бадан/Bergenia
- `chugang-25`: каолин, шафран, звездчатка, бадан, шлемник байкальский
- `dadud`: железо
- `dali-16`: слива, бадан
- `dugsel-degu`: шафран, каолин
- `garuda-5`: **аконит джунгарский**
- `gurgum-13`: шафран, красный сандал
- `gurgum-7`: шафран, хвойник, водосбор
- `kola-11`: хвойник, герпетоспермум
- `lishi-11`: нивяник
- `manushitan`: бузина черная, имбирь
- `mutik-25`: орлиное дерево
- `nikil`: пион уклоняющийся
- `norbu-7`: бузина черная
- `olse-25`: каменная соль, шеллак, **аконит**, витания, патока
- `pakdzhub`: гвоздика, марена красильная, кемпферия галанга
- `pangen-15`: адатода васика, звездчатка, слива непальская
- `sebru-dane`: шафран
- `shiser`: имбирь лекарственный
- `shizhet-11`: имбирь, каменная соль
- `skyurura-25`: шлемник байкальский, водосбор, соссюрея иволистная, лаковые червецы, оносма прицветочная, бадан толстолистный, ломатогониум, момордика, бузина
- `sugmel-10`: имбирь
- `tcovo-8`: шлемник байкальский, зубчатка поздняя, **аконит разнолистный**, мытник
- `thanchen-10`: бузина
- `thanchen-25`: шлемник байкальский, пустырник

**Safety-relevant to confirm first:** `agar-35` — manla names `Strychnos nux vomica`
(чилибуха) where bimala named **аконит** (Aconitum); distinct toxic plants. Verify the
true toxic constituent(s) before any production use. `garuda-5`, `olse-25`, `tcovo-8`
also dropped an aconite entry.

The full per-formula analysis (manla vs bimala) and the consolidation changelog are in
the session workflow outputs; raw verbatim source for both sites remains in
`research/raw-crawl-verbose.json`.

## Open items for the review

- **Source factual discrepancies surfaced during cleanup (NOT auto-corrected):**
  - `gurgum-8`: name says "8" but `name_original` + body read "Gurgum 7".
  - `agar-15`, `pangen-15`: Latin `Melia composita` maps to a different Russian
    component (`адатода васика` / Adhatoda vasica) than the binomial implies.
  - `srogdzin-11`: manla lists `Shorea robusta` where composition has `Bombax ceiba`.
  - `Terminalia belerica` vs accepted `Terminalia bellirica` (variant, left as-is).
  - `gurkyung`: body composition list repeats `костус` twice — possible duplicate
    component, left as-is.
- A few **ambiguous case-agreement** spots were deliberately left (e.g. `giwan-9`
  "повреждение или ушибах печени" — nominative vs prepositional unclear). Decide
  during review.
- **Food-timing conflicts** (`kharuca-5`, `kola-11`, `kola-4`): sources disagree on
  taking the formula on an empty stomach vs after food — clinically meaningful; manla
  kept as primary with an in-record note, confirm the correct administration.
- **Best-effort Russian common names** were paired to manla's Latin binomials during
  consolidation; verify the botanical identifications (several flagged per formula in
  the workflow output, e.g. `agar-8` Mesua ferrea vs Bombax ceiba, Commiphora as
  «ладан»).
- Whether dosing/administration text is retained, reworded, or removed for production.

## Sign-off

| Date       | Reviewer | Scope                                                                 | Outcome    |
|------------|----------|-----------------------------------------------------------------------|------------|
| 2026-06-28 | Owner    | **Library UI surface** — formula browser, **minimal field set only** (name / nature / composition / member cross-links / themes / cautions). Verbose fields (indications / traditional_use / dosing_notes / source_text) stay unsurfaced. | **Approved — gate lifted** (`FORMULA_BRANCH_ENABLED = true`, Plan 009) |
| —          | —        | Verbose source fields (indications / dosing / traditional use) for any richer surface | pending |

_When production-eligible content is approved, record it here and define how it is
surfaced._

**UI surface status (Plan 009, 2026-06-28 — gate LIFTED).** The library contains a
fully built **combinations (formula) browser** — list, search, and a formula card
with member cross-links — and it is now **registered**: the single
`src/bot/commands/_formula-gate.ts → FORMULA_BRANCH_ENABLED` constant is `true`
(owner sign-off, table above). The `🧪 Формулы` hub branch, formula search hits,
and herb-card "Входит в формулы" cross-links are all live. The formula card
surfaces only the owner-approved **minimal field set**
(name / nature / composition / member cross-links / themes / cautions) — the
verbose review-pending fields (indications / traditional_use / dosing_notes /
source_text) and the raw body **remain unsurfaced**, still pending the
verbose-field review.
