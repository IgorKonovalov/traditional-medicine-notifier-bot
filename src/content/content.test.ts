import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadContent } from './loader';
import { buildIndex } from './index-builders';

/**
 * Spins up a throwaway content dir on disk so we exercise the real fs walk in
 * `loadContent` (no mocks), mirroring how the boot loader runs.
 */
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Corpus {
  readonly herbs?: Record<string, string>;
  readonly combinations?: Record<string, string>;
  readonly categories?: Record<string, string>;
}

function writeCorpus(corpus: Corpus): string {
  const root = mkdtempSync(join(tmpdir(), 'tmnb-content-'));
  dirs.push(root);
  for (const [bucket, files] of Object.entries(corpus)) {
    const dir = join(root, bucket);
    mkdirSync(dir, { recursive: true });
    for (const [name, contents] of Object.entries(files)) {
      writeFileSync(join(dir, `${name}.md`), contents);
    }
  }
  return root;
}

const CATEGORY = `---
id: digestive-herbs
name_ru: Травы для пищеварения
---

Описание категории.
`;

const HERB = `---
id: tib-haritaki
tradition: tibetan
category: digestive-herbs
name_ru: Миробалан хебула
---

Описание травы.
`;

const COMBINATION = `---
id: tib-formula-agar-8
tradition: tibetan
name_ru: Агар-8
name_original: A gar 8
aliases:
  - Агар 8
  - Орлиное дерево 8
composition:
  - миробалан хебула
  - мускатный орех
members:
  - tib-haritaki
themes:
  - традиционно связывают с поддержкой нервной системы
cautions:
  - возможна индивидуальная непереносимость
tags:
  - сердце
  - ветер
sources:
  - https://manla.ru/herbs/
---

Описание состава.
`;

describe('loadContent — combinations', () => {
  it('parses a combination with its members, themes, aliases and sources', () => {
    const root = writeCorpus({
      categories: { 'digestive-herbs': CATEGORY },
      herbs: { 'tib-haritaki': HERB },
      combinations: { 'tib-formula-agar-8': COMBINATION },
    });

    const content = loadContent(root);
    const combo = content.combinations.byId.get('tib-formula-agar-8');

    expect(combo).toBeDefined();
    expect(combo?.nameRu).toBe('Агар-8');
    expect(combo?.nameOriginal).toBe('A gar 8');
    expect(combo?.aliases).toEqual(['Агар 8', 'Орлиное дерево 8']);
    expect(combo?.composition).toEqual(['миробалан хебула', 'мускатный орех']);
    expect(combo?.members).toEqual(['tib-haritaki']);
    expect(combo?.themes).toHaveLength(1);
    expect(combo?.sources).toEqual(['https://manla.ru/herbs/']);
    expect(combo?.body).toContain('Описание состава');
  });

  it('rejects a combination whose member id does not resolve to a herb', () => {
    const dangling = COMBINATION.replace('tib-haritaki', 'tib-missing');
    const root = writeCorpus({
      categories: { 'digestive-herbs': CATEGORY },
      herbs: { 'tib-haritaki': HERB },
      combinations: { 'tib-formula-agar-8': dangling },
    });

    expect(() => loadContent(root)).toThrow(/unknown herb member "tib-missing"/);
  });

  it('rejects a combination with an empty composition', () => {
    const noComposition = COMBINATION.replace('composition:', 'composition: []\nignored:');
    const root = writeCorpus({
      categories: { 'digestive-herbs': CATEGORY },
      herbs: { 'tib-haritaki': HERB },
      combinations: { 'tib-formula-agar-8': noComposition },
    });

    expect(() => loadContent(root)).toThrow(/empty composition/);
  });

  it('rejects duplicate combination ids', () => {
    const root = writeCorpus({
      categories: { 'digestive-herbs': CATEGORY },
      herbs: { 'tib-haritaki': HERB },
      combinations: { a: COMBINATION, b: COMBINATION },
    });

    expect(() => loadContent(root)).toThrow(/duplicate combination id/);
  });
});

describe('buildIndex — combinations', () => {
  it('projects combinations with member and source counts', () => {
    const root = writeCorpus({
      categories: { 'digestive-herbs': CATEGORY },
      herbs: { 'tib-haritaki': HERB },
      combinations: { 'tib-formula-agar-8': COMBINATION },
    });

    const index = buildIndex(loadContent(root));

    expect(index.counts.combinations).toBe(1);
    expect(index.combinations[0]).toMatchObject({
      id: 'tib-formula-agar-8',
      nameRu: 'Агар-8',
      nameOriginal: 'A gar 8',
      memberCount: 1,
      sourceCount: 1,
    });
  });
});
