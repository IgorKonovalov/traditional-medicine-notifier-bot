/**
 * Boot-time content loader. Walks the markdown corpus under `CONTENT_DIR`,
 * parses frontmatter with gray-matter, coerces each record into the typed
 * shapes from `types.ts`, and runs corpus-level validation. Fail-fast: a
 * malformed file crashes boot rather than serving broken content.
 *
 * This is the only module (besides scripts) allowed to touch `node:fs` for
 * content — the rest of the domain receives the already-loaded `LoadedContent`.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import matter from 'gray-matter';

import { buildCrossLinks } from './cross-links';
import { validateCorpus } from './validate';
import { isVisibleTradition } from './visibility';
import type {
  Category,
  Combination,
  ContentBucket,
  Guide,
  GuideSection,
  Herb,
  LoadedContent,
  Tip,
  TipSource,
  Tradition,
} from './types';
import { TRADITIONS } from './types';

interface RawDoc {
  readonly file: string;
  readonly data: Record<string, unknown>;
  readonly body: string;
}

export interface LoadOptions {
  /**
   * Include hidden-tradition records (ADR 013) instead of applying the
   * Tibetan-only visibility gate. The runtime bot loads with the gate **on**
   * (default); the content-index builder loads with it **off** so the committed
   * index keeps every authored record (Chinese files stay indexed, not deleted).
   */
  readonly includeHiddenTraditions?: boolean;
}

export function loadContent(contentDir: string, opts: LoadOptions = {}): LoadedContent {
  // Tradition visibility gate (ADR 013): hidden-tradition records are dropped
  // here, before buckets/cross-links/validation, so nothing downstream sees them.
  // The index builder opts out (includeHiddenTraditions) to index the full corpus.
  const visible = (t: Tradition): boolean =>
    opts.includeHiddenTraditions === true || isVisibleTradition(t);
  const herbs = readDir(join(contentDir, 'herbs'))
    .map(parseHerb)
    .filter((h) => visible(h.tradition));
  const combinations = readDir(join(contentDir, 'combinations'))
    .map(parseCombination)
    .filter((c) => visible(c.tradition));
  const categories = readDir(join(contentDir, 'categories')).map(parseCategory);
  const tips = readDir(join(contentDir, 'tips')).map(parseTip);
  const guides = readDir(join(contentDir, 'guides')).map(parseGuide);

  const content: LoadedContent = {
    herbs: toBucket(herbs),
    combinations: toBucket(combinations),
    categories: toBucket(categories),
    tips: toBucket(tips),
    guides: toBucket(guides),
    crossLinks: buildCrossLinks(combinations),
  };

  validateCorpus(content);
  return content;
}

// ─── filesystem walk ──────────────────────────────────────────────────────────

/** Recursively collect parsed `.md` docs under `dir`, skipping dotfiles/dirs. */
function readDir(dir: string): RawDoc[] {
  if (!existsSync(dir)) return [];
  const out: RawDoc[] = [];
  // Sort by code-point order so traversal is deterministic across platforms:
  // readdirSync yields NTFS-sorted names on Windows but arbitrary (inode) order
  // on Linux, which makes the generated content index drift between dev machines
  // and CI. Plain `<`/`>` keeps the ordering locale-independent (unlike
  // localeCompare, whose result depends on the host ICU/locale).
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...readDir(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const parsed = matter(readFileSync(full, 'utf8'));
      out.push({
        file: full,
        data: parsed.data as Record<string, unknown>,
        body: parsed.content.trim(),
      });
    }
  }
  return out;
}

function toBucket<T extends { id: string }>(items: T[]): ContentBucket<T> {
  const byId = new Map<string, T>();
  for (const item of items) byId.set(item.id, item);
  return { all: items, byId };
}

// ─── per-record parsing ─────────────────────────────────────────────────────────

function parseHerb(doc: RawDoc): Herb {
  const id = reqString(doc, 'id');
  const tradition = reqString(doc, 'tradition');
  if (!TRADITIONS.includes(tradition as Tradition)) {
    throw new Error(
      `${doc.file}: invalid tradition "${tradition}" (expected one of ${TRADITIONS.join(', ')})`,
    );
  }
  const herb: Herb = {
    id,
    tradition: tradition as Tradition,
    category: reqString(doc, 'category'),
    nameRu: reqString(doc, 'name_ru'),
    properties: strArray(doc, 'properties'),
    uses: strArray(doc, 'uses'),
    cautions: strArray(doc, 'cautions'),
    tags: strArray(doc, 'tags'),
    body: doc.body,
    ...optString(doc, 'name_latin', 'nameLatin'),
    ...optString(doc, 'name_original', 'nameOriginal'),
  };
  return herb;
}

function parseCombination(doc: RawDoc): Combination {
  const tradition = reqString(doc, 'tradition');
  if (!TRADITIONS.includes(tradition as Tradition)) {
    throw new Error(
      `${doc.file}: invalid tradition "${tradition}" (expected one of ${TRADITIONS.join(', ')})`,
    );
  }
  const members = strArray(doc, 'members');
  const indications = strArray(doc, 'indications');
  const traditionalUse = strArray(doc, 'traditional_use');
  const dosingNotes = strArray(doc, 'dosing_notes');
  const combination: Combination = {
    id: reqString(doc, 'id'),
    tradition: tradition as Tradition,
    nameRu: reqString(doc, 'name_ru'),
    aliases: strArray(doc, 'aliases'),
    composition: strArray(doc, 'composition'),
    themes: strArray(doc, 'themes'),
    cautions: strArray(doc, 'cautions'),
    tags: strArray(doc, 'tags'),
    sources: strArray(doc, 'sources'),
    body: doc.body,
    ...optString(doc, 'name_original', 'nameOriginal'),
    ...optString(doc, 'category', 'category'),
    ...optString(doc, 'nature', 'nature'),
    ...optString(doc, 'source_text', 'sourceText'),
    ...(members.length > 0 ? { members } : {}),
    ...(indications.length > 0 ? { indications } : {}),
    ...(traditionalUse.length > 0 ? { traditionalUse } : {}),
    ...(dosingNotes.length > 0 ? { dosingNotes } : {}),
  };
  return combination;
}

function parseCategory(doc: RawDoc): Category {
  return {
    id: reqString(doc, 'id'),
    nameRu: reqString(doc, 'name_ru'),
    body: doc.body,
  };
}

function parseTip(doc: RawDoc): Tip {
  const source = parseTipSource(doc);
  return {
    id: reqString(doc, 'id'),
    body: doc.body,
    ...optString(doc, 'category', 'category'),
    ...(source !== undefined ? { source } : {}),
  };
}

/**
 * Coerce the optional `source` block. Absent → `undefined`. When present it must
 * be an object with a non-empty string `work`; `part`/`chapter` are optional
 * strings. Any other shape fails fast with the file path (plan 003).
 */
function parseTipSource(doc: RawDoc): TipSource | undefined {
  const value = doc.data['source'];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${doc.file}: field "source" must be an object`);
  }
  const raw = value as Record<string, unknown>;
  const work = raw['work'];
  if (typeof work !== 'string' || work.trim() === '') {
    throw new Error(`${doc.file}: field "source.work" must be a non-empty string`);
  }
  for (const key of ['part', 'chapter'] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== 'string') {
      throw new Error(`${doc.file}: field "source.${key}" must be a string`);
    }
  }
  return {
    work,
    ...(typeof raw['part'] === 'string' ? { part: raw['part'] } : {}),
    ...(typeof raw['chapter'] === 'string' ? { chapter: raw['chapter'] } : {}),
  };
}

function parseGuide(doc: RawDoc): Guide {
  const tradition = reqString(doc, 'tradition');
  if (!TRADITIONS.includes(tradition as Tradition)) {
    throw new Error(
      `${doc.file}: invalid tradition "${tradition}" (expected one of ${TRADITIONS.join(', ')})`,
    );
  }
  const source = parseTipSource(doc);
  return {
    id: reqString(doc, 'id'),
    tradition: tradition as Tradition,
    title: reqString(doc, 'title'),
    tags: strArray(doc, 'tags'),
    sections: splitSections(doc.body),
    ...(source !== undefined ? { source } : {}),
  };
}

/**
 * Split a guide's markdown body into ordered sections on `##` headings — the
 * fixed section-delimiter convention (ADR 008). Text before the first `##` is an
 * intro section with an empty heading. Deeper headings (`###`+) are *not* section
 * breaks: they stay inside the body so authors can nest without spawning pages.
 */
function splitSections(body: string): GuideSection[] {
  const sections: GuideSection[] = [];
  let heading = '';
  let buffer: string[] = [];
  const flush = (): void => {
    const text = buffer.join('\n').trim();
    if (heading !== '' || text !== '') sections.push({ heading, body: text });
    buffer = [];
  };
  for (const line of body.split('\n')) {
    const match = /^##(?!#)\s+(.+?)\s*$/.exec(line);
    if (match) {
      flush();
      heading = match[1] ?? '';
    } else {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

// ─── field coercion ─────────────────────────────────────────────────────────────

function reqString(doc: RawDoc, key: string): string {
  const value = doc.data[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${doc.file}: missing or empty required string field "${key}"`);
  }
  return value;
}

/** Returns `{ [outKey]: value }` when present, or `{}` so spreading is a no-op. */
function optString(doc: RawDoc, key: string, outKey: string): Record<string, string> {
  const value = doc.data[key];
  if (value === undefined || value === null) return {};
  if (typeof value !== 'string') {
    throw new Error(`${doc.file}: field "${key}" must be a string`);
  }
  return { [outKey]: value };
}

function strArray(doc: RawDoc, key: string): string[] {
  const value = doc.data[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new Error(`${doc.file}: field "${key}" must be a list of strings`);
  }
  return value as string[];
}
