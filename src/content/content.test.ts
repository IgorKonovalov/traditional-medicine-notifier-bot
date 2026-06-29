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
  readonly tips?: Record<string, string>;
  readonly guides?: Record<string, string>;
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

  it('rejects a combination with no composition, source text, or indications', () => {
    const empty = COMBINATION.replace('composition:', 'composition: []\nignored:');
    const root = writeCorpus({
      categories: { 'digestive-herbs': CATEGORY },
      herbs: { 'tib-haritaki': HERB },
      combinations: { 'tib-formula-agar-8': empty },
    });

    expect(() => loadContent(root)).toThrow(/no composition, source text, or indications/);
  });

  it('accepts an empty composition when source text is present (ADR 006)', () => {
    const noComp = COMBINATION.replace(
      'composition:\n  - миробалан хебула\n  - мускатный орех',
      'composition: []',
    ).replace('members:\n  - tib-haritaki\n', '');
    const verbose = noComp.replace(
      '---\n\nОписание состава.',
      'source_text: Полный текст из источника о составе.\n---\n\nОписание состава.',
    );
    const root = writeCorpus({
      categories: { 'digestive-herbs': CATEGORY },
      herbs: { 'tib-haritaki': HERB },
      combinations: { 'tib-formula-agar-8': verbose },
    });

    expect(() => loadContent(root)).not.toThrow();
    const combo = loadContent(root).combinations.byId.get('tib-formula-agar-8');
    expect(combo?.composition).toEqual([]);
    expect(combo?.sourceText).toBe('Полный текст из источника о составе.');
  });

  it('parses verbose source fields (indications, traditionalUse, dosingNotes)', () => {
    const verbose = COMBINATION.replace(
      'sources:\n  - https://manla.ru/herbs/',
      [
        'indications:',
        '  - жар сердца',
        '  - бессонница',
        'traditional_use:',
        '  - применяли при расстройствах Ветра',
        'dosing_notes:',
        '  - принимать по 0,1-0,2 г',
        'sources:',
        '  - https://manla.ru/herbs/',
      ].join('\n'),
    );
    const root = writeCorpus({
      categories: { 'digestive-herbs': CATEGORY },
      herbs: { 'tib-haritaki': HERB },
      combinations: { 'tib-formula-agar-8': verbose },
    });

    const combo = loadContent(root).combinations.byId.get('tib-formula-agar-8');
    expect(combo?.indications).toEqual(['жар сердца', 'бессонница']);
    expect(combo?.traditionalUse).toEqual(['применяли при расстройствах Ветра']);
    expect(combo?.dosingNotes).toEqual(['принимать по 0,1-0,2 г']);
  });

  it('parses optional nature and category (#1, ADR 007)', () => {
    const classified = COMBINATION.replace(
      'name_original: A gar 8',
      'name_original: A gar 8\ncategory: digestive-herbs\nnature: слегка прохладная',
    );
    const root = writeCorpus({
      categories: { 'digestive-herbs': CATEGORY },
      herbs: { 'tib-haritaki': HERB },
      combinations: { 'tib-formula-agar-8': classified },
    });

    const combo = loadContent(root).combinations.byId.get('tib-formula-agar-8');
    expect(combo?.category).toBe('digestive-herbs');
    expect(combo?.nature).toBe('слегка прохладная');
  });

  it('leaves nature and category undefined when absent', () => {
    const root = writeCorpus({
      categories: { 'digestive-herbs': CATEGORY },
      herbs: { 'tib-haritaki': HERB },
      combinations: { 'tib-formula-agar-8': COMBINATION },
    });

    const combo = loadContent(root).combinations.byId.get('tib-formula-agar-8');
    expect(combo?.category).toBeUndefined();
    expect(combo?.nature).toBeUndefined();
  });

  it('rejects a combination whose category does not resolve (ADR 007)', () => {
    const bad = COMBINATION.replace(
      'name_original: A gar 8',
      'name_original: A gar 8\ncategory: no-such-cat',
    );
    const root = writeCorpus({
      categories: { 'digestive-herbs': CATEGORY },
      herbs: { 'tib-haritaki': HERB },
      combinations: { 'tib-formula-agar-8': bad },
    });

    expect(() => loadContent(root)).toThrow(/unknown category "no-such-cat"/);
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

const CHINESE_HERB = `---
id: tcm-ginger
tradition: chinese
category: digestive-herbs
name_ru: Имбирь
---

Описание травы.
`;

describe('loadContent — tradition visibility gate (ADR 013)', () => {
  it('drops hidden-tradition herbs (Chinese) and keeps visible ones (Tibetan) by default', () => {
    const root = writeCorpus({
      categories: { 'digestive-herbs': CATEGORY },
      herbs: { 'tib-haritaki': HERB, 'tcm-ginger': CHINESE_HERB },
    });

    const content = loadContent(root);
    expect(content.herbs.all.map((h) => h.id)).toEqual(['tib-haritaki']);
    expect(content.herbs.byId.has('tcm-ginger')).toBe(false);
  });

  it('keeps the full corpus when includeHiddenTraditions is set (the index builder path)', () => {
    const root = writeCorpus({
      categories: { 'digestive-herbs': CATEGORY },
      herbs: { 'tib-haritaki': HERB, 'tcm-ginger': CHINESE_HERB },
    });

    const content = loadContent(root, { includeHiddenTraditions: true });
    expect(content.herbs.all.map((h) => h.id).sort()).toEqual(['tcm-ginger', 'tib-haritaki']);
  });
});

describe('loadContent — deterministic traversal order', () => {
  it('returns docs in code-point filename order regardless of write order', () => {
    // Files are written in deliberately non-alphabetical order. The loader must
    // sort its directory walk so the in-memory order — and thus the generated
    // content index — is identical on every platform: readdirSync is NTFS-sorted
    // on Windows but inode-ordered on Linux/CI. Regression guard for the
    // cross-platform index-drift fix. On Linux this fails if the sort is dropped
    // (readdirSync would echo the reverse write order); on Windows it is a
    // weaker guard since NTFS pre-sorts.
    const mk = (id: string): string => COMBINATION.replace('tib-formula-agar-8', id);
    const root = writeCorpus({
      categories: { 'digestive-herbs': CATEGORY },
      herbs: { 'tib-haritaki': HERB },
      combinations: {
        'cmb-zebra': mk('cmb-zebra'),
        'cmb-alpha': mk('cmb-alpha'),
        'cmb-mango': mk('cmb-mango'),
      },
    });

    const ids = loadContent(root).combinations.all.map((c) => c.id);
    expect(ids).toEqual(['cmb-alpha', 'cmb-mango', 'cmb-zebra']);
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
      hasIndications: false,
    });
  });

  it('flags hasIndications when verbose indications are present', () => {
    const verbose = COMBINATION.replace('themes:', 'indications:\n  - жар сердца\nthemes:');
    const root = writeCorpus({
      categories: { 'digestive-herbs': CATEGORY },
      herbs: { 'tib-haritaki': HERB },
      combinations: { 'tib-formula-agar-8': verbose },
    });

    const index = buildIndex(loadContent(root));
    expect(index.combinations[0]?.hasIndications).toBe(true);
  });

  it('projects nature/category and counts combinations per category (ADR 007)', () => {
    const classified = COMBINATION.replace(
      'name_original: A gar 8',
      'name_original: A gar 8\ncategory: digestive-herbs\nnature: слегка прохладная',
    );
    const root = writeCorpus({
      categories: { 'digestive-herbs': CATEGORY },
      herbs: { 'tib-haritaki': HERB },
      combinations: { 'tib-formula-agar-8': classified },
    });

    const index = buildIndex(loadContent(root));
    expect(index.combinations[0]).toMatchObject({
      category: 'digestive-herbs',
      nature: 'слегка прохладная',
    });
    const cat = index.categories.find((c) => c.id === 'digestive-herbs');
    expect(cat?.combinationCount).toBe(1);
    expect(cat?.herbCount).toBe(1);
  });
});

const TIP_WITH_SOURCE = `---
id: tip-x
source:
  work: Чжуд-ши
  part: Тантра объяснений
  chapter: гл. 18 «Мера питания»
---

Короткая образовательная заметка.
`;

const TIP_NO_SOURCE = `---
id: tip-y
---

Заметка без источника.
`;

describe('loadContent — tips', () => {
  it('parses a tip with a structured source block', () => {
    const root = writeCorpus({ tips: { 'tip-x': TIP_WITH_SOURCE } });
    const tip = loadContent(root).tips.byId.get('tip-x');

    expect(tip?.source).toEqual({
      work: 'Чжуд-ши',
      part: 'Тантра объяснений',
      chapter: 'гл. 18 «Мера питания»',
    });
    expect(tip?.body).not.toContain('Источник');
  });

  it('leaves source undefined when absent', () => {
    const root = writeCorpus({ tips: { 'tip-y': TIP_NO_SOURCE } });
    expect(loadContent(root).tips.byId.get('tip-y')?.source).toBeUndefined();
  });

  it('omits absent optional source parts (work only)', () => {
    const workOnly = TIP_WITH_SOURCE.replace(
      '  part: Тантра объяснений\n  chapter: гл. 18 «Мера питания»\n',
      '',
    );
    const root = writeCorpus({ tips: { 'tip-x': workOnly } });
    expect(loadContent(root).tips.byId.get('tip-x')?.source).toEqual({ work: 'Чжуд-ши' });
  });

  it('rejects a source missing the required work', () => {
    const noWork = TIP_WITH_SOURCE.replace('  work: Чжуд-ши\n', '');
    const root = writeCorpus({ tips: { 'tip-x': noWork } });
    expect(() => loadContent(root)).toThrow(/source\.work/);
  });

  it('rejects a non-object source', () => {
    const scalar = TIP_WITH_SOURCE.replace(
      'source:\n  work: Чжуд-ши\n  part: Тантра объяснений\n  chapter: гл. 18 «Мера питания»',
      'source: Чжуд-ши',
    );
    const root = writeCorpus({ tips: { 'tip-x': scalar } });
    expect(() => loadContent(root)).toThrow(/"source" must be an object/);
  });
});

describe('buildIndex — tips', () => {
  it('projects the source when present and omits it otherwise', () => {
    const root = writeCorpus({ tips: { 'tip-x': TIP_WITH_SOURCE, 'tip-y': TIP_NO_SOURCE } });
    const index = buildIndex(loadContent(root));

    const withSource = index.tips.find((t) => t.id === 'tip-x');
    const without = index.tips.find((t) => t.id === 'tip-y');
    expect(withSource?.source).toEqual({
      work: 'Чжуд-ши',
      part: 'Тантра объяснений',
      chapter: 'гл. 18 «Мера питания»',
    });
    expect(without && 'source' in without).toBe(false);
  });
});

const GUIDE = `---
id: tib-osnovy
tradition: tibetan
title: «Основы тибетской медицины»
source:
  work: Чжуд-ши
  part: Тантра объяснений
  chapter: гл. 5–6
tags:
  - основы
---

Здоровье — это равновесие трёх начал.

## Пять первоэлементов

Пространство, ветер, огонь, вода и земля.

### Подраздел

Этот заголовок не делит на секции.

## Ветер (rLung)

Природа прохладно-нейтральная.
`;

describe('loadContent — guides', () => {
  it('splits the body into an intro section plus one section per ## heading', () => {
    const root = writeCorpus({ guides: { 'tib-osnovy': GUIDE } });
    const guide = loadContent(root).guides.byId.get('tib-osnovy');

    expect(guide?.title).toBe('«Основы тибетской медицины»');
    expect(guide?.tradition).toBe('tibetan');
    expect(guide?.tags).toEqual(['основы']);
    expect(guide?.source).toEqual({
      work: 'Чжуд-ши',
      part: 'Тантра объяснений',
      chapter: 'гл. 5–6',
    });
    expect(guide?.sections.map((s) => s.heading)).toEqual([
      '',
      'Пять первоэлементов',
      'Ветер (rLung)',
    ]);
    // The intro keeps its lead-in text; a ### heading stays inside its section.
    expect(guide?.sections[0]?.body).toBe('Здоровье — это равновесие трёх начал.');
    expect(guide?.sections[1]?.body).toContain('### Подраздел');
  });

  it('omits an empty leading intro when the body opens with a ## heading', () => {
    const noIntro = GUIDE.replace('Здоровье — это равновесие трёх начал.\n\n## Пять', '## Пять');
    const root = writeCorpus({ guides: { 'tib-osnovy': noIntro } });
    const guide = loadContent(root).guides.byId.get('tib-osnovy');

    expect(guide?.sections[0]?.heading).toBe('Пять первоэлементов');
  });

  it('rejects a guide with an invalid tradition', () => {
    const bad = GUIDE.replace('tradition: tibetan', 'tradition: martian');
    const root = writeCorpus({ guides: { 'tib-osnovy': bad } });
    expect(() => loadContent(root)).toThrow(/invalid tradition "martian"/);
  });

  it('rejects a guide missing its title', () => {
    const noTitle = GUIDE.replace('title: «Основы тибетской медицины»\n', '');
    const root = writeCorpus({ guides: { 'tib-osnovy': noTitle } });
    expect(() => loadContent(root)).toThrow(/required string field "title"/);
  });

  it('rejects a guide with no non-empty section', () => {
    const empty = `---
id: tib-empty
tradition: tibetan
title: Пустая статья
---
`;
    const root = writeCorpus({ guides: { 'tib-empty': empty } });
    expect(() => loadContent(root)).toThrow(/has no non-empty section/);
  });

  it('rejects duplicate guide ids', () => {
    const root = writeCorpus({ guides: { a: GUIDE, b: GUIDE } });
    expect(() => loadContent(root)).toThrow(/duplicate guide id/);
  });
});

describe('buildIndex — guides', () => {
  it('projects guides with their section count and source', () => {
    const root = writeCorpus({ guides: { 'tib-osnovy': GUIDE } });
    const index = buildIndex(loadContent(root));

    expect(index.counts.guides).toBe(1);
    expect(index.guides[0]).toMatchObject({
      id: 'tib-osnovy',
      tradition: 'tibetan',
      title: '«Основы тибетской медицины»',
      sectionCount: 3,
      source: { work: 'Чжуд-ши', part: 'Тантра объяснений', chapter: 'гл. 5–6' },
    });
  });
});
