/**
 * Regenerate the doctor-facing combination review page.
 *
 *   npm run content:review        # write research/_private/formula-review.html
 *
 * This is the reproducible re-audit tool for Plan 004's fix → re-audit loop.
 * It renders every combination in the corpus as a filterable card (tradition /
 * canon-tier / composition-quality filters + free-text search), surfacing the
 * verbose ADR-006 staging fields (indications, traditional use, dosing,
 * cautions, raw source text) plus the Чжуд-ши canon-match candidate so a
 * qualified practitioner can cross-check each record against manla.ru.
 *
 * Inputs (read-only):
 *   - content/combinations/*.md            (via the boot loader)
 *   - research/_private/match-tiers.json   id → canon tier bucket
 *   - research/_private/match-intermediate.json  id → ranked canon candidates
 *
 * The match-* inputs and the HTML output live under research/_private/, which is
 * gitignored (ADR 006 — verbose, non-sanitised source data stays local behind
 * the production gate). Only this generator script is committed, so the artifact
 * is reproducible wherever those private inputs are present.
 *
 * The output is deterministic: cards are emitted in stable id order.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadContent } from '../src/content/loader';
import type { Combination } from '../src/content/types';

const CONTENT_DIR = process.env['CONTENT_DIR'] ?? './content';
const PRIVATE_DIR = process.env['REVIEW_PRIVATE_DIR'] ?? './research/_private';
const OUT_PATH = join(PRIVATE_DIR, 'formula-review.html');

// ─── canon-match inputs ─────────────────────────────────────────────────────────

type Tier = 'identity' | 'component' | 'possible' | 'none';
const TIERS: readonly Exclude<Tier, 'none'>[] = ['identity', 'component', 'possible'];

interface CanonCandidate {
  readonly name: string;
  readonly form: string;
  readonly ref: string;
  readonly score: number;
  readonly shared: number;
  readonly ingredients: readonly string[];
}
interface MatchEntry {
  readonly corpus: { readonly id: string };
  readonly candidates: readonly CanonCandidate[];
}

function readJson<T>(path: string): T {
  if (!existsSync(path)) {
    throw new Error(`missing review input: ${path} (expected under ${PRIVATE_DIR})`);
  }
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

// ─── html helpers ─────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Canon overlap: round to 2dp, strip trailing zeros, but keep ≥1 decimal (1 → 1.0). */
function fmtScore(score: number): string {
  let s = (Math.round(score * 100) / 100).toString();
  if (!s.includes('.')) s += '.0';
  return s;
}

function listField(label: string, items: readonly string[]): string {
  if (items.length === 0) return '';
  const lis = items.map((i) => `<li>${esc(i)}</li>`).join('');
  return `<div class="field "><div class="flabel">${label}</div><ul>${lis}</ul></div>`;
}

function sourcesField(sources: readonly string[]): string {
  if (sources.length === 0) return '';
  const lis = sources
    .map((s) => `<li><a href="${esc(s)}" target="_blank" rel="noopener">${esc(s)}</a></li>`)
    .join('');
  return `<div class="field"><div class="flabel">Sources</div><ul>${lis}</ul></div>`;
}

// Only Identity and Component matches are shown (Plan 004: Possible/None dropped
// as noise). Identity is baked into name_ru; Component is baked as a body note —
// the card keeps the labeled match as confirmation for the doctor.
function canonField(entry: MatchEntry | undefined, tier: Tier): string {
  if (tier !== 'identity' && tier !== 'component') return '';
  const c = entry?.candidates[0];
  if (!c) return '';
  const label = tier === 'identity' ? 'Canon identity (Чжуд-ши)' : 'Based on canon (Чжуд-ши)';
  const ingr = c.ingredients.map((i) => `<li>${esc(i)}</li>`).join('');
  return (
    `<div class="field match"><div class="flabel">${label}</div>` +
    `<div class="matchline">«${esc(c.name)}» <span class="mmeta">${esc(c.form)} · overlap ${fmtScore(c.score)} · ${c.shared} shared</span></div>` +
    `<div class="mref">${esc(c.ref)}</div>` +
    `<div class="field sub"><div class="flabel">Canon ingredients</div><ul>${ingr}</ul></div></div>`
  );
}

function rawDetails(summary: string, text: string): string {
  return `<details class="raw"><summary>${summary}</summary><pre>${esc(text)}</pre></details>`;
}

// ─── card model ─────────────────────────────────────────────────────────────────

const TIER_BADGE: Record<Tier, string> = {
  identity: '<span class="badge tier-identity">Identity</span>',
  component: '<span class="badge tier-component">Component</span>',
  possible: '<span class="badge tier-possible">Possible</span>',
  none: '<span class="badge tier-none">No canon basis</span>',
};

function qualOf(tags: readonly string[]): string {
  if (tags.includes('incomplete-composition')) return 'incomplete-composition';
  if (tags.includes('composition-non-itemized')) return 'composition-non-itemized';
  return 'complete';
}

function searchAttr(c: Combination, entry: MatchEntry | undefined, catName: string | undefined): string {
  const parts = [
    c.nameRu,
    c.nameOriginal ?? '',
    c.id,
    catName ?? '',
    c.nature ?? '',
    ...c.composition,
    ...(c.indications ?? []),
    entry?.candidates[0]?.name ?? '',
  ];
  return esc(parts.join(' ').toLowerCase());
}

function valueField(label: string, value: string | undefined): string {
  if (!value) return '';
  return `<div class="field "><div class="flabel">${label}</div><div>${esc(value)}</div></div>`;
}

function renderCard(
  c: Combination,
  tier: Tier,
  entry: MatchEntry | undefined,
  catNameById: ReadonlyMap<string, string>,
): string {
  const qual = qualOf(c.tags);
  const catBadge = c.category
    ? `<span class="badge cat">${esc(catNameById.get(c.category) ?? c.category)}</span>`
    : '';
  const badges =
    TIER_BADGE[tier] +
    catBadge +
    (qual !== 'complete' ? `<span class="badge qual">${qual}</span>` : '') +
    `<span class="badge meta">${c.composition.length} ingr.</span>`;
  const norig = c.nameOriginal ? `<div class="norig">${esc(c.nameOriginal)}</div>\n    ` : '';

  // Field order (#5): Traditional use → Показания → Природа → Состав → … .
  const fields = [
    listField('Traditional use', c.traditionalUse ?? []),
    listField('Показания', c.indications ?? []),
    valueField('Природа', c.nature),
    listField('Состав', c.composition),
    listField('Members (herb ids)', c.members ?? []),
    listField('Dosing notes', c.dosingNotes ?? []),
    listField('Cautions', c.cautions),
    sourcesField(c.sources),
    canonField(entry, tier),
    c.sourceText ? rawDetails('source_text', c.sourceText) : '',
    rawDetails('body (markdown)', c.body),
  ].filter((f) => f !== '');
  const body = fields.map((f) => `    ${f}`).join('\n');

  const catName = c.category ? catNameById.get(c.category) : undefined;
  return `<article class="card" data-trad="${c.tradition}" data-tier="${tier}" data-cat="${c.category ?? ''}" data-qual="${qualOf(c.tags)}" data-search="${searchAttr(c, entry, catName)}">
  <header class="chead">
    <h2>${esc(c.nameRu)}</h2>
    ${norig}<div class="badges">${badges}</div>
    <div class="fileid">${c.id}.md</div>
  </header>
  <div class="body">
${body}
  </div>
</article>`;
}

// ─── page shell (template captured from the original review artifact) ────────────

const STYLE = `<style>
:root{--bg:#0f1115;--card:#1a1d24;--mut:#8a92a6;--bd:#2a2f3a;--fg:#e6e9ef;--acc:#6ea8fe;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,Segoe UI,Roboto,Arial,sans-serif}
header.top{position:sticky;top:0;z-index:10;background:#0f1115ee;backdrop-filter:blur(6px);
  border-bottom:1px solid var(--bd);padding:12px 18px}
h1{font-size:17px;margin:0 0 6px}
.sum{color:var(--mut);font-size:12px;margin-bottom:10px}
.toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
input[type=search]{flex:1;min-width:220px;background:#11141a;border:1px solid var(--bd);color:var(--fg);
  padding:8px 10px;border-radius:8px;font-size:14px}
.fbtn{background:#11141a;border:1px solid var(--bd);color:var(--mut);padding:5px 10px;border-radius:999px;
  cursor:pointer;font-size:12px}
.fbtn.active{color:#fff;border-color:var(--acc);background:#1d2740}
.count{color:var(--mut);font-size:12px;margin-left:auto}
main{padding:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px;align-items:start}
.card{background:var(--card);border:1px solid var(--bd);border-radius:12px;overflow:hidden}
.chead{padding:12px 14px;border-bottom:1px solid var(--bd)}
.chead h2{font-size:15px;margin:0 0 2px}
.norig{color:var(--mut);font-size:12px;margin-bottom:6px}
.badges{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0 4px}
.badge{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--bd);color:var(--mut)}
.badge.meta{color:#9aa4b8}
.badge.qual{color:#ffd27d;border-color:#5a4a1f;background:#2a2310}
.badge.cat{color:#d7a3ff;border-color:#5a3a7a;background:#1e1430}
.tier-identity{color:#7ee2a8;border-color:#235e3f;background:#10241a}
.tier-component{color:#9ec5ff;border-color:#284a7a;background:#101a2a}
.tier-possible{color:#e0c06a;border-color:#5a4a1f;background:#221c0e}
.tier-none{color:#a0a6b2}
.fileid{color:#5a6172;font-size:11px;margin-top:6px;font-family:ui-monospace,Consolas,monospace}
.body{padding:10px 14px}
.field{margin:8px 0}
.flabel{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut);margin-bottom:3px}
.field ul{margin:0;padding-left:18px}
.field li{margin:1px 0}
.field.match{border:1px solid #284a7a;border-radius:8px;padding:8px;background:#0e1626}
.matchline{font-weight:600}
.mmeta{color:var(--mut);font-weight:400;font-size:12px}
.mref{color:var(--mut);font-size:11px;margin:2px 0 4px}
.field.sub .flabel{opacity:.8}
a{color:var(--acc);word-break:break-all}
details.raw{margin-top:8px;border-top:1px dashed var(--bd);padding-top:6px}
summary{cursor:pointer;color:var(--mut);font-size:12px}
pre{white-space:pre-wrap;background:#0c0e13;border:1px solid var(--bd);border-radius:8px;
  padding:8px;font-size:12px;color:#c7cdda;overflow:auto;max-height:340px}
.hidden{display:none!important}
</style>`;

const SCRIPT = `<script>
const F={trad:"",tier:"",qual:"",cat:""};
const q=document.getElementById('q'),main=document.getElementById('main'),countEl=document.getElementById('count');
const cards=[...document.querySelectorAll('.card')];
function apply(){
  const term=q.value.trim().toLowerCase();
  let n=0;
  for(const c of cards){
    let ok=true;
    if(F.trad && c.dataset.trad!==F.trad) ok=false;
    if(ok && F.tier && c.dataset.tier!==F.tier) ok=false;
    if(ok && F.qual && c.dataset.qual!==F.qual) ok=false;
    if(ok && F.cat && c.dataset.cat!==F.cat) ok=false;
    if(ok && term && !c.dataset.search.includes(term)) ok=false;
    c.classList.toggle('hidden',!ok);
    if(ok) n++;
  }
  countEl.textContent=n+" / "+cards.length+" shown";
}
q.addEventListener('input',apply);
for(const b of document.querySelectorAll('.fbtn.group')){
  b.addEventListener('click',()=>{
    const g=b.dataset.g;
    document.querySelectorAll('.fbtn.group[data-g="'+g+'"]').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); F[g]=b.dataset.v; apply();
  });
}
apply();
</script>`;

function header(summary: string): string {
  return `<header class="top">
  <h1>Formula review — combinations corpus</h1>
  <div class="sum">${summary}</div>
  <div class="toolbar">
    <input id="q" type="search" placeholder="Поиск: название, состав, показания, канон…">
    <span class="count" id="count"></span>
  </div>
  <div class="toolbar" style="margin-top:8px">
    <span class="fbtn group active" data-g="trad" data-v="">all</span>
    <span class="fbtn group" data-g="trad" data-v="tibetan">tibetan</span>
    <span class="fbtn group" data-g="trad" data-v="chinese">chinese</span>
    <span style="width:10px"></span>
    <span class="fbtn group active" data-g="tier" data-v="">any tier</span>
    <span class="fbtn group" data-g="tier" data-v="identity">identity</span>
    <span class="fbtn group" data-g="tier" data-v="component">component</span>
    <span class="fbtn group" data-g="tier" data-v="possible">possible</span>
    <span class="fbtn group" data-g="tier" data-v="none">no-canon</span>
    <span style="width:10px"></span>
    <span class="fbtn group active" data-g="qual" data-v="">any quality</span>
    <span class="fbtn group" data-g="qual" data-v="complete">complete</span>
    <span class="fbtn group" data-g="qual" data-v="incomplete-composition">incomplete</span>
    <span class="fbtn group" data-g="qual" data-v="composition-non-itemized">non-itemized</span>
    <span style="width:10px"></span>
    <span class="fbtn group active" data-g="cat" data-v="">any class</span>
    <span class="fbtn group" data-g="cat" data-v="rinchen-pills">rinchen</span>
  </div>
</header>`;
}

// ─── build ──────────────────────────────────────────────────────────────────────

function main(): void {
  const content = loadContent(CONTENT_DIR);
  const combos = [...content.combinations.all].sort((a, b) => a.id.localeCompare(b.id));

  const tierRanks = readJson<Record<Tier, string[]>>(join(PRIVATE_DIR, 'match-tiers.json'));
  const tierById = new Map<string, Tier>();
  for (const t of TIERS) for (const id of tierRanks[t] ?? []) tierById.set(id, t);

  const matchById = new Map<string, MatchEntry>();
  for (const e of readJson<MatchEntry[]>(join(PRIVATE_DIR, 'match-intermediate.json'))) {
    matchById.set(e.corpus.id, e);
  }

  const catNameById = new Map<string, string>();
  for (const cat of content.categories.all) catNameById.set(cat.id, cat.nameRu);
  const rinchenCount = combos.filter((c) => c.category === 'rinchen-pills').length;

  const counts: Record<Tier, number> = { identity: 0, component: 0, possible: 0, none: 0 };
  let tib = 0;
  let chi = 0;
  let incomplete = 0;
  let nonItemized = 0;
  for (const c of combos) {
    const tier = tierById.get(c.id) ?? 'none';
    counts[tier]++;
    if (c.tradition === 'tibetan') tib++;
    else chi++;
    const qual = qualOf(c.tags);
    if (qual === 'incomplete-composition') incomplete++;
    if (qual === 'composition-non-itemized') nonItemized++;
  }

  const summary =
    `${combos.length} formulas · tibetan ${tib} / chinese ${chi} · ` +
    `identity ${counts.identity} · component ${counts.component} · possible ${counts.possible} · ` +
    `no-canon ${counts.none} · incomplete ${incomplete} · non-itemized ${nonItemized} · rinchen ${rinchenCount}`;

  const cards = combos
    .map((c) => renderCard(c, tierById.get(c.id) ?? 'none', matchById.get(c.id), catNameById))
    .join('\n');

  const html =
    `<!doctype html><html lang="ru"><head><meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<title>Formula review — combinations corpus</title>\n` +
    `${STYLE}</head><body>\n` +
    `${header(summary)}\n` +
    `<main id="main">\n${cards}\n</main>\n` +
    `${SCRIPT}\n</body></html>\n`;

  writeFileSync(OUT_PATH, html);
  console.log(`formula review written → ${OUT_PATH} (${combos.length} cards)`);
  console.log(`  ${summary}`);
}

main();
