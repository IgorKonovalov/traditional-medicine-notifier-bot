import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildCrossLinks } from './cross-links';
import { loadContent } from './loader';
import type { Combination } from './types';

/** Minimal `Combination` factory — only the fields the cross-link builder reads. */
function combo(id: string, members?: string[]): Combination {
  return {
    id,
    tradition: 'tibetan',
    nameRu: id,
    aliases: [],
    composition: [],
    themes: [],
    cautions: [],
    tags: [],
    sources: [],
    body: '',
    ...(members !== undefined ? { members } : {}),
  };
}

describe('buildCrossLinks', () => {
  it('maps a herb to every formula that lists it as a member', () => {
    const links = buildCrossLinks([combo('f-1', ['herb-a', 'herb-b']), combo('f-2', ['herb-b'])]);

    expect(links.formulasByHerb.get('herb-a')).toEqual(['f-1']);
    expect(links.formulasByHerb.get('herb-b')).toEqual(['f-1', 'f-2']);
  });

  it('preserves corpus order of formulas per herb', () => {
    const links = buildCrossLinks([combo('f-z', ['herb-x']), combo('f-a', ['herb-x'])]);

    expect(links.formulasByHerb.get('herb-x')).toEqual(['f-z', 'f-a']);
  });

  it('returns an empty (undefined) entry for a herb in no formula', () => {
    const links = buildCrossLinks([combo('f-1', ['herb-a'])]);

    expect(links.formulasByHerb.get('herb-unknown')).toBeUndefined();
    expect(links.formulasByHerb.get('herb-unknown') ?? []).toEqual([]);
  });

  it('exposes the forward map (formula → member herbs), empty list when none', () => {
    const links = buildCrossLinks([combo('f-1', ['herb-a', 'herb-b']), combo('f-empty')]);

    expect(links.herbsByFormula.get('f-1')).toEqual(['herb-a', 'herb-b']);
    expect(links.herbsByFormula.get('f-empty')).toEqual([]);
  });
});

// ─── integration: the maps surface on the real loaded corpus ──────────────────

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

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
composition:
  - миробалан хебула
members:
  - tib-haritaki
sources:
  - https://manla.ru/herbs/
---

Описание состава.
`;

describe('loadContent — crossLinks', () => {
  it('surfaces the reverse herb→formula map on LoadedContent', () => {
    const root = mkdtempSync(join(tmpdir(), 'tmnb-xlinks-'));
    dirs.push(root);
    for (const [bucket, files] of Object.entries({
      categories: { 'digestive-herbs': CATEGORY },
      herbs: { 'tib-haritaki': HERB },
      combinations: { 'tib-formula-agar-8': COMBINATION },
    })) {
      const dir = join(root, bucket);
      mkdirSync(dir, { recursive: true });
      for (const [name, contents] of Object.entries(files)) {
        writeFileSync(join(dir, `${name}.md`), contents);
      }
    }

    const content = loadContent(root);
    expect(content.crossLinks.formulasByHerb.get('tib-haritaki')).toEqual(['tib-formula-agar-8']);
    expect(content.crossLinks.herbsByFormula.get('tib-formula-agar-8')).toEqual(['tib-haritaki']);
  });
});
