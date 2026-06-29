import { describe, expect, it } from 'vitest';

import { buildCrossLinks } from '../../content/cross-links';
import type { Combination, Herb, LoadedContent } from '../../content/types';

import { herbCardKeyboard, herbFormulaLinks, renderHerb } from './_herb-card';

function combo(id: string, nameRu: string, members?: string[]): Combination {
  return {
    id,
    tradition: 'tibetan',
    nameRu,
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

function herb(id: string): Herb {
  return {
    id,
    tradition: 'tibetan',
    category: 'digestive-herbs',
    nameRu: 'Миробалан хебула',
    properties: [],
    uses: [],
    cautions: [],
    tags: [],
    body: 'Описание травы.',
  };
}

/** A content slice with two formulas, one of which lists `tib-haritaki`. */
function contentSlice(): Pick<LoadedContent, 'crossLinks' | 'combinations'> {
  const combos = [
    combo('tib-formula-agar-8', 'Агар-8', ['tib-haritaki']),
    combo('tib-formula-other', 'Другой', ['tib-other']),
  ];
  return {
    crossLinks: buildCrossLinks(combos),
    combinations: { all: combos, byId: new Map(combos.map((c) => [c.id, c])) },
  };
}

describe('herbFormulaLinks', () => {
  it('resolves the formulas a herb belongs to when the branch is enabled', () => {
    expect(herbFormulaLinks('tib-haritaki', contentSlice(), true)).toEqual([
      { id: 'tib-formula-agar-8', nameRu: 'Агар-8' },
    ]);
  });

  it('returns nothing when the branch is withheld (doctor-gate off)', () => {
    expect(herbFormulaLinks('tib-haritaki', contentSlice(), false)).toEqual([]);
  });

  it('returns nothing for a herb in no formula', () => {
    expect(herbFormulaLinks('tib-unlinked', contentSlice(), true)).toEqual([]);
  });
});

describe('renderHerb — cross-link section', () => {
  it('omits the "Входит в формулы" section when there are no links', () => {
    const out = renderHerb(herb('tib-haritaki'), []);
    expect(out).not.toContain('Входит в формулы');
  });

  it('shows the section header when links are present', () => {
    const out = renderHerb(herb('tib-haritaki'), [{ id: 'tib-formula-agar-8', nameRu: 'Агар-8' }]);
    expect(out).toContain('Входит в формулы:');
  });

  it('always ends with the render-time disclaimer (ADR 006)', () => {
    const out = renderHerb(herb('tib-haritaki'), [{ id: 'tib-formula-agar-8', nameRu: 'Агар-8' }]);
    expect(out.endsWith('консультируйтесь с врачом.')).toBe(true);
  });

  it('notes the truncation when the herb is in more formulas than the cap', () => {
    const links = Array.from({ length: 94 }, (_, i) => ({ id: `f-${i}`, nameRu: `Ф ${i}` }));
    expect(renderHerb(herb('tib-haritaki'), links)).toContain(
      'Входит в формулы (показаны 8 из 94):',
    );
  });

  it('uses the plain label when within the cap', () => {
    const links = Array.from({ length: 5 }, (_, i) => ({ id: `f-${i}`, nameRu: `Ф ${i}` }));
    const out = renderHerb(herb('tib-haritaki'), links);
    expect(out).toContain('Входит в формулы:');
    expect(out).not.toContain('показаны');
  });
});

describe('herbCardKeyboard — reverse-link cap', () => {
  const links = (n: number): { id: string; nameRu: string }[] =>
    Array.from({ length: n }, (_, i) => ({ id: `tib-formula-${i}`, nameRu: `Формула ${i}` }));

  const formulaButtons = (kb: ReturnType<typeof herbCardKeyboard>): unknown[] =>
    kb.reply_markup.inline_keyboard
      .flat()
      .filter((b) => 'callback_data' in b && b.callback_data.startsWith('lib:formula:'));

  it('caps formula buttons to 8 so the keyboard stays within Telegram limits', () => {
    expect(formulaButtons(herbCardKeyboard('tib-haritaki', [], links(94)))).toHaveLength(8);
  });

  it('shows every formula button when within the cap', () => {
    expect(formulaButtons(herbCardKeyboard('tib-haritaki', [], links(3)))).toHaveLength(3);
  });
});
