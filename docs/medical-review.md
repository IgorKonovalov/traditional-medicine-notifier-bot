# Medical review gate (ADR 006)

**Status: PENDING — owner-managed.** The verbose Tibetan-formula corpus under
`content/combinations/` is a **staging artifact**. Per ADR 006, **none of it may
reach the production bot** until a qualified Tibetan-medicine practitioner has
reviewed it and the owner has signed off. The owner will report when the review is
complete and how any changes should be applied.

## Review inputs

- **Corpus:** `content/combinations/*.md` (161 formulas) — structured fields
  (`indications`, `traditional_use`, `dosing_notes`, `composition`, `cautions`) plus
  a body. Formulas that had both sources (47) are now **consolidated into a single
  manla-preferred record** (see Dual-source consolidation); the rest keep their single
  source body.
- **Raw provenance:** `research/raw-crawl-verbose.json` — the unmerged crawl output
  (full verbatim text per source).

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

| Date | Reviewer | Scope | Outcome |
|------|----------|-------|---------|
| —    | —        | —     | pending |

_When production-eligible content is approved, record it here and define how it is
surfaced (the bot currently has no combinations command — that is a separate
follow-up plan)._
