import { describe, expect, it } from 'vitest';

import type { Combination, Herb, LoadedContent } from '../../content/types';
import { buildCrossLinks } from '../../content/cross-links';
import type { BotDeps } from '../context';

import { backState, clampPage, formulaMatches, herbMatches, searchHits } from './library';

describe('clampPage', () => {
  it('clamps a too-high page to the last page (no wrap past the end)', () => {
    expect(clampPage(99, 20, 8)).toEqual({ page: 2, pageCount: 3 });
  });

  it('clamps a negative page to the first page (no wrap past the start)', () => {
    expect(clampPage(-5, 20, 8)).toEqual({ page: 0, pageCount: 3 });
  });

  it('treats an empty list as a single page', () => {
    expect(clampPage(0, 0, 8)).toEqual({ page: 0, pageCount: 1 });
  });

  it('keeps an in-range page unchanged', () => {
    expect(clampPage(1, 20, 8)).toEqual({ page: 1, pageCount: 3 });
  });
});

describe('backState — library navigation never wraps or dead-ends', () => {
  it('card reached via a tradition list returns to that list with its page', () => {
    expect(backState({ screen: 'card', tradition: 'tibetan', page: 2, herbId: 'h' })).toEqual({
      screen: 'list',
      tradition: 'tibetan',
      page: 2,
    });
  });

  it('card reached via a category list returns to that list', () => {
    expect(
      backState({ screen: 'card', category: 'digestive-herbs', page: 1, herbId: 'h' }),
    ).toEqual({ screen: 'list', category: 'digestive-herbs', page: 1 });
  });

  it('a context-free card (notification deep link) returns to the hub', () => {
    expect(backState({ screen: 'card', page: 0, herbId: 'h' })).toEqual({ screen: 'hub', page: 0 });
  });

  it('a tradition list returns to the tradition picker', () => {
    expect(backState({ screen: 'list', tradition: 'chinese', page: 3 })).toEqual({
      screen: 'pick-tradition',
      page: 0,
    });
  });

  it('a category list returns to the category picker', () => {
    expect(backState({ screen: 'list', category: 'digestive-herbs', page: 0 })).toEqual({
      screen: 'pick-category',
      page: 0,
    });
  });

  it('either picker returns to the herbs sub-menu', () => {
    expect(backState({ screen: 'pick-tradition', page: 0 })).toEqual({ screen: 'herbs', page: 0 });
    expect(backState({ screen: 'pick-category', page: 0 })).toEqual({ screen: 'herbs', page: 0 });
  });

  it('the herbs sub-menu and the tips leaf return to the hub', () => {
    expect(backState({ screen: 'herbs', page: 0 })).toEqual({ screen: 'hub', page: 0 });
    expect(backState({ screen: 'tips', page: 0 })).toEqual({ screen: 'hub', page: 0 });
  });

  it('a card opened from search results returns to those results', () => {
    expect(backState({ screen: 'card', query: 'миро', page: 1, herbId: 'h' })).toEqual({
      screen: 'results',
      query: 'миро',
      page: 1,
    });
  });

  it('results return to the search prompt, and the prompt to the hub', () => {
    expect(backState({ screen: 'results', query: 'миро', page: 2 })).toEqual({
      screen: 'search',
      page: 0,
    });
    expect(backState({ screen: 'search', page: 0 })).toEqual({ screen: 'hub', page: 0 });
  });
});

// ─── search matching + the doctor-gate on formula hits ────────────────────────

function herb(id: string, nameRu: string, nameLatin?: string): Herb {
  return {
    id,
    tradition: 'tibetan',
    category: 'digestive-herbs',
    nameRu,
    properties: [],
    uses: [],
    cautions: [],
    tags: [],
    body: '',
    ...(nameLatin !== undefined ? { nameLatin } : {}),
  };
}

function combo(id: string, nameRu: string): Combination {
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
  };
}

describe('herbMatches / formulaMatches', () => {
  it('matches a herb case-insensitively across RU and Latin names', () => {
    const h = herb('h', 'Миробалан хебула', 'Terminalia chebula');
    expect(herbMatches(h, 'миробалан')).toBe(true);
    expect(herbMatches(h, 'terminalia')).toBe(true);
    expect(herbMatches(h, 'женьшень')).toBe(false);
  });

  it('matches a formula by name', () => {
    expect(formulaMatches(combo('f', 'Агар-8'), 'агар')).toBe(true);
  });
});

describe('searchHits — formulas stay behind the doctor-gate', () => {
  function deps(): BotDeps {
    const herbs = [herb('tib-haritaki', 'Миробалан хебула')];
    const combos = [combo('tib-formula-agar-8', 'Миробалановая формула')];
    const content = {
      herbs: { all: herbs, byId: new Map(herbs.map((h) => [h.id, h])) },
      combinations: { all: combos, byId: new Map(combos.map((c) => [c.id, c])) },
      categories: { all: [], byId: new Map() },
      tips: { all: [], byId: new Map() },
      crossLinks: buildCrossLinks(combos),
    } as unknown as LoadedContent;
    return { content, timezone: 'UTC', botUsername: 'b', adminTelegramIds: new Set() };
  }

  it('returns herb hits but never formula hits while the branch is withheld', () => {
    // Both the herb and the formula contain "миробалан"; only the herb surfaces.
    const hits = searchHits(deps(), 'миробалан');
    expect(hits).toEqual([{ kind: 'herb', id: 'tib-haritaki', name: 'Миробалан хебула' }]);
    expect(hits.some((h) => h.kind === 'formula')).toBe(false);
  });
});
