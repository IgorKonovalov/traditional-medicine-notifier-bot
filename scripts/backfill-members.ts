/**
 * Plan 019 Phase 1/5 — backfill `members:` across formula files from their
 * free-text `composition:` Latin binomials, using research/ingredient-member-map.json.
 *
 *   pnpm run content:members --dry-run      # print a per-formula diff, no writes
 *   pnpm run content:members                # write resolved members in place
 *
 * Design constraints:
 *   - **Minimal diff.** Only the `members:` block is rewritten; the rest of the
 *     frontmatter is preserved byte-for-byte (no gray-matter re-stringify, which
 *     would reflow folded scalars and quoting across every field).
 *   - **Idempotent.** Re-running produces no change once members are in sync.
 *   - **Order = composition order.** Member buttons follow the formula's own
 *     ingredient ordering; pre-existing hand-curated members (e.g. a lone
 *     `tib-haritaki` on a Russian-only formula) are preserved, appended last.
 *   - **Match tolerance.** Latin lookup is diacritic- and case-insensitive,
 *     punctuation-flattened, and tolerant of a trailing `sp.`/`spp.` and of the
 *     misspellings/synonyms enumerated in the map.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import matter from 'gray-matter';

const COMBINATIONS_DIR = join('content', 'combinations');
const MAP_PATH = join('research', 'ingredient-member-map.json');

interface MapItem {
  readonly herbId: string;
  readonly latin: string;
  readonly synonyms: readonly string[];
}

/** Normalize a Latin string for matching: NFD-strip diacritics, lowercase, flatten
 *  punctuation to single spaces, drop a trailing `sp`/`spp` token. */
function normalizeLatin(raw: string): string {
  const flattened = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return flattened.replace(/\s+(sp|spp)$/, '').trim();
}

/** Build the normalized-Latin → herbId lookup from the committed map. */
function buildLookup(items: readonly MapItem[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const item of items) {
    for (const name of [item.latin, ...item.synonyms]) {
      const key = normalizeLatin(name);
      if (key !== '' && !lookup.has(key)) lookup.set(key, item.herbId);
    }
  }
  return lookup;
}

/** Extract the parenthetical Latin from a composition entry, if any. */
function latinOf(entry: string): string | null {
  const m = /\(([^)]*[A-Za-z][^)]*)\)/.exec(entry);
  return m ? m[1]!.trim() : null;
}

/**
 * Resolve the member id list for a formula in composition order, then append any
 * pre-existing members not already present (preserve hand-curated ids). Deduped.
 */
function resolveMembers(
  composition: readonly string[],
  existing: readonly string[],
  lookup: Map<string, string>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of composition) {
    const latin = latinOf(String(entry));
    if (latin === null) continue;
    const id = lookup.get(normalizeLatin(latin));
    if (id !== undefined && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of existing) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** The frontmatter line range `[start, end)` (exclusive) of an existing `members:`
 *  block, or null. `fmEnd` is the index of the closing `---` line. */
function findBlock(lines: string[], key: string, fmEnd: number): { start: number; end: number } | null {
  for (let i = 1; i < fmEnd; i++) {
    if (new RegExp(`^${key}:`).test(lines[i]!)) {
      let j = i + 1;
      while (j < fmEnd && /^\s+-\s+/.test(lines[j]!)) j++;
      return { start: i, end: j };
    }
  }
  return null;
}

/** Rewrite only the `members:` block in the raw markdown; preserve all else. */
function rewriteMembers(raw: string, memberIds: readonly string[]): string {
  const lines = raw.split('\n');
  // Frontmatter is delimited by the leading `---` (line 0) and the next `---`.
  const fmEnd = lines.indexOf('---', 1);
  if (fmEnd === -1) return raw; // not a frontmattered file — leave untouched

  const block = memberIds.length > 0 ? ['members:', ...memberIds.map((id) => `  - ${id}`)] : [];

  const existing = findBlock(lines, 'members', fmEnd);
  if (existing !== null) {
    lines.splice(existing.start, existing.end - existing.start, ...block);
  } else if (block.length > 0) {
    // Insert after the composition block (always present); fall back to fm end.
    const comp = findBlock(lines, 'composition', fmEnd);
    const at = comp !== null ? comp.end : fmEnd;
    lines.splice(at, 0, ...block);
  }
  return lines.join('\n');
}

function main(): void {
  const dryRun = process.argv.slice(2).includes('--dry-run');
  const map = JSON.parse(readFileSync(MAP_PATH, 'utf8')) as { items: MapItem[] };
  const lookup = buildLookup(map.items);

  const files = readdirSync(COMBINATIONS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();

  let changed = 0;
  let withMembers = 0;
  let totalLinks = 0;

  for (const file of files) {
    const path = join(COMBINATIONS_DIR, file);
    const raw = readFileSync(path, 'utf8');
    const { data } = matter(raw);
    const composition = (data['composition'] as string[] | undefined) ?? [];
    const existing = (data['members'] as string[] | undefined) ?? [];

    const resolved = resolveMembers(composition, existing, lookup);
    if (resolved.length > 0) withMembers++;
    totalLinks += resolved.length;

    const before = existing.join(',');
    const after = resolved.join(',');
    if (before === after) continue;

    changed++;
    const added = resolved.filter((id) => !existing.includes(id));
    console.log(`~ ${file}`);
    console.log(`    before: [${existing.join(', ') || '—'}]`);
    console.log(`    after:  [${resolved.join(', ') || '—'}]`);
    if (added.length > 0) console.log(`    +added: ${added.join(', ')}`);

    if (!dryRun) writeFileSync(path, rewriteMembers(raw, resolved));
  }

  console.log(
    `\n${dryRun ? '[dry-run] ' : ''}${changed} formula(s) ${dryRun ? 'would change' : 'changed'}; ` +
      `${withMembers}/${files.length} formulas carry ≥1 member; ${totalLinks} member links total.`,
  );
  if (dryRun) console.log('No files written (--dry-run).');
}

main();
