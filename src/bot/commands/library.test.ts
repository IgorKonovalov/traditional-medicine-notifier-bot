import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Telegraf, type Context } from 'telegraf';

import type { Combination, Food, Herb, LoadedContent } from '../../content/types';
import { buildCrossLinks } from '../../content/cross-links';
import { ensureUser } from '../../db/repositories/user.repo';
import { setupTestDb, teardownTestDb } from '../../db/test-helper';
import type { BotDeps } from '../context';
import { messages } from '../messages';
import { type AnchoredSession, loadSession, saveSession, SESSION_TTL_MS } from '../session-store';

import { FORMULA_BRANCH_ENABLED } from './_formula-gate';
import {
  backState,
  clampPage,
  foodGroupsView,
  foodListView,
  formulaListView,
  formulaMatches,
  formulaResultsView,
  herbMatches,
  hubView,
  registerLibrarySearchTextCapture,
  searchHits,
} from './library';

/** Pull every button label out of an inline keyboard. */
function buttonLabels(view: { keyboard: ReturnType<typeof hubView>['keyboard'] }): string[] {
  return view.keyboard.reply_markup.inline_keyboard.flat().map((b) => ('text' in b ? b.text : ''));
}

/** Pull every button's callback_data out of an inline keyboard. */
function buttonData(view: { keyboard: ReturnType<typeof hubView>['keyboard'] }): string[] {
  return view.keyboard.reply_markup.inline_keyboard
    .flat()
    .map((b) => ('callback_data' in b ? b.callback_data : ''));
}

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
  it('card reached via the flat «Все травы» list returns to that list with its page', () => {
    expect(backState({ screen: 'card', allList: true, page: 2, herbId: 'h' })).toEqual({
      screen: 'list',
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

  it('the flat «Все травы» list returns to the herbs sub-menu', () => {
    expect(backState({ screen: 'list', page: 3 })).toEqual({ screen: 'herbs', page: 0 });
  });

  it('a category list returns to the category picker', () => {
    expect(backState({ screen: 'list', category: 'digestive-herbs', page: 0 })).toEqual({
      screen: 'pick-category',
      page: 0,
    });
  });

  it('the category picker returns to the herbs sub-menu', () => {
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

  it('a guide section returns to the guide list, restoring its list page', () => {
    expect(
      backState({ screen: 'guide-section', guideId: 'tib-osnovy', section: 3, page: 1 }),
    ).toEqual({ screen: 'guide-list', page: 1 });
  });

  it('the guide list returns to the hub', () => {
    expect(backState({ screen: 'guide-list', page: 2 })).toEqual({ screen: 'hub', page: 0 });
  });

  // ── formula-only search chain (Plan 017) ──
  it('a formula card carrying formulaScope+query returns to the formula results', () => {
    expect(
      backState({
        screen: 'formula-card',
        query: 'агар',
        formulaScope: true,
        page: 1,
        formulaId: 'f',
      }),
    ).toEqual({ screen: 'formula-results', query: 'агар', page: 1 });
  });

  it('a formula card carrying only query (global search) returns to the mixed results', () => {
    expect(backState({ screen: 'formula-card', query: 'агар', page: 1, formulaId: 'f' })).toEqual({
      screen: 'results',
      query: 'агар',
      page: 1,
    });
  });

  it('a formula card with no origin returns to the formula list', () => {
    expect(backState({ screen: 'formula-card', page: 2, formulaId: 'f' })).toEqual({
      screen: 'formula-list',
      page: 2,
    });
  });

  it('formula results return to the formula search prompt, and the prompt to the formula list', () => {
    expect(backState({ screen: 'formula-results', query: 'агар', page: 3 })).toEqual({
      screen: 'formula-search',
      page: 0,
    });
    expect(backState({ screen: 'formula-search', page: 0 })).toEqual({
      screen: 'formula-list',
      page: 0,
    });
  });

  it('the formula list returns to the hub', () => {
    expect(backState({ screen: 'formula-list', page: 1 })).toEqual({ screen: 'hub', page: 0 });
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

describe('searchHits — formulas follow the doctor-gate', () => {
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

  it('surfaces herb and formula hits when the branch is registered', () => {
    // Both the herb and the formula contain "миробалан"; with the gate lifted
    // both surface (herbs first, then formulas).
    const hits = searchHits(deps(), 'миробалан');
    expect(hits).toEqual([
      { kind: 'herb', id: 'tib-haritaki', name: 'Миробалан хебула' },
      { kind: 'formula', id: 'tib-formula-agar-8', name: 'Миробалановая формула' },
    ]);
  });
});

describe('combinations surface tracks the ADR 006 doctor-gate', () => {
  it('is registered (owner sign-off 2026-06-28 — docs/medical-review.md)', () => {
    // The gate is now lifted. Turning it back OFF is a deliberate decision, not a
    // regression — update this expectation in lockstep if that ever happens.
    expect(FORMULA_BRANCH_ENABLED).toBe(true);
  });

  it('the hub shows the 🧪 Составы branch when registered', () => {
    expect(buttonLabels(hubView())).toContain('🧪 Составы');
  });
});

describe('library hub — guides branch (Plan 006)', () => {
  it('the hub always shows the 📖 Статьи branch', () => {
    expect(buttonLabels(hubView())).toContain('📖 Статьи');
  });
});

// ─── foods browse + filter (Plan 013, ADR 012) ────────────────────────────────

function food(
  id: string,
  group: Food['group'],
  warmth: Food['warmth'],
  constitutions: Food['constitutions'],
): Food {
  return {
    id,
    tradition: 'tibetan',
    nameRu: id,
    group,
    warmth,
    tastes: ['сладкий'],
    constitutions,
    effect: 'описание',
    tags: [],
  };
}

const N = { wind: 'neutral', bile: 'neutral', phlegm: 'neutral' } as const;

/** Deps with a small food catalogue spanning groups, warmth bands, and effects. */
function foodDeps(): BotDeps {
  const foods = [
    food('food-banana', 'fruit', 'прохладная', { ...N, wind: 'pacifies' }),
    food('food-grape', 'fruit', 'прохладная', N),
    food('food-egg', 'egg', 'горячая', { ...N, phlegm: 'pacifies' }),
    food('food-garlic', 'green-vegetable', 'тёплая', { ...N, wind: 'pacifies' }),
    food('food-watermelon', 'berry', 'холодная', { ...N, wind: 'aggravates', bile: 'pacifies' }),
  ];
  const content = {
    herbs: { all: [], byId: new Map() },
    combinations: { all: [], byId: new Map() },
    categories: { all: [], byId: new Map() },
    tips: { all: [], byId: new Map() },
    guides: { all: [], byId: new Map() },
    foods: { all: foods, byId: new Map(foods.map((f) => [f.id, f])) },
  } as unknown as LoadedContent;
  return { content, timezone: 'UTC', botUsername: 'b', adminTelegramIds: new Set() };
}

describe('library hub — foods branch (Plan 013)', () => {
  it('the hub always shows the 🥗 Продукты branch', () => {
    expect(buttonLabels(hubView())).toContain('🥗 Продукты');
    expect(buttonData(hubView())).toContain('lib:foods');
  });
});

describe('foodGroupsView', () => {
  it('lists only non-empty groups in catalogue order, with a filter entry on top', () => {
    const view = foodGroupsView(foodDeps(), 0);
    const data = buttonData(view);
    // Filter entry is the first row.
    expect(data[0]).toBe('lib:ffil');
    // egg, green-vegetable, fruit, berry are present (catalogue order); grain absent.
    expect(data).toEqual([
      'lib:ffil',
      'lib:fg:egg',
      'lib:fg:green-vegetable',
      'lib:fg:fruit',
      'lib:fg:berry',
      'lib:back',
      'lib:home',
    ]);
  });

  it('a group button is labelled with its Russian name and food count', () => {
    expect(buttonLabels(foodGroupsView(foodDeps(), 0))).toContain('Фрукты (2)');
  });
});

describe('foodListView — constitution filter lists only foods that pacify the начало', () => {
  it('the Ветер filter lists exactly the wind-pacifying foods', () => {
    const view = foodListView(foodDeps(), { screen: 'food-list', foodCon: 'wind', page: 0 });
    const data = buttonData(view);
    expect(data).toContain('lib:food:food-banana');
    expect(data).toContain('lib:food:food-garlic');
    // watermelon aggravates wind; grape is neutral — neither may appear.
    expect(data).not.toContain('lib:food:food-watermelon');
    expect(data).not.toContain('lib:food:food-grape');
    expect(view.text).toBe(messages.foods.filterWind);
  });
});

describe('foodListView — warmth filter bands', () => {
  it('the прохладные band lists прохладная and холодная foods, never тёплая/горячая', () => {
    const view = foodListView(foodDeps(), { screen: 'food-list', foodWarm: 'cool', page: 0 });
    const data = buttonData(view);
    expect(data).toContain('lib:food:food-banana'); // прохладная
    expect(data).toContain('lib:food:food-watermelon'); // холодная
    expect(data).not.toContain('lib:food:food-egg'); // горячая
    expect(data).not.toContain('lib:food:food-garlic'); // тёплая
    expect(view.text).toBe(messages.foods.coolTitle);
  });

  it('the тёплые band lists горячая and тёплая foods only', () => {
    const data = buttonData(
      foodListView(foodDeps(), { screen: 'food-list', foodWarm: 'warm', page: 0 }),
    );
    expect(data).toContain('lib:food:food-egg');
    expect(data).toContain('lib:food:food-garlic');
    expect(data).not.toContain('lib:food:food-banana');
  });
});

describe('backState — foods navigation never wraps or dead-ends', () => {
  it('a food card returns to its group list, restoring the group and page', () => {
    expect(
      backState({ screen: 'food-card', foodGroup: 'fruit', page: 1, foodId: 'food-banana' }),
    ).toEqual({ screen: 'food-list', foodGroup: 'fruit', page: 1 });
  });

  it('a food card from a constitution filter returns to that filtered list', () => {
    expect(
      backState({ screen: 'food-card', foodCon: 'wind', page: 0, foodId: 'food-banana' }),
    ).toEqual({ screen: 'food-list', foodCon: 'wind', page: 0 });
  });

  it('a group list returns to the groups screen; a filter list to the filter screen', () => {
    expect(backState({ screen: 'food-list', foodGroup: 'fruit', page: 2 })).toEqual({
      screen: 'food-groups',
      page: 0,
    });
    expect(backState({ screen: 'food-list', foodWarm: 'cool', page: 0 })).toEqual({
      screen: 'food-filter',
      page: 0,
    });
  });

  it('the filter screen and the groups screen return toward the hub', () => {
    expect(backState({ screen: 'food-filter', page: 0 })).toEqual({
      screen: 'food-groups',
      page: 0,
    });
    expect(backState({ screen: 'food-groups', page: 0 })).toEqual({ screen: 'hub', page: 0 });
  });
});

// ─── formula-only search surface (Plan 017) ───────────────────────────────────

/** Deps whose herb and one formula share the token «миро», to prove no leak. */
function formulaDeps(): BotDeps {
  const herbs = [herb('tib-haritaki', 'Миробалан хебула')];
  const combos = [
    combo('tib-formula-agar-8', 'Агар-8'),
    combo('tib-formula-miro', 'Миробалановая формула'),
  ];
  const content = {
    herbs: { all: herbs, byId: new Map(herbs.map((h) => [h.id, h])) },
    combinations: { all: combos, byId: new Map(combos.map((c) => [c.id, c])) },
    categories: { all: [], byId: new Map() },
    tips: { all: [], byId: new Map() },
    crossLinks: buildCrossLinks(combos),
  } as unknown as LoadedContent;
  return { content, timezone: 'UTC', botUsername: 'b', adminTelegramIds: new Set() };
}

describe('formula-only search views', () => {
  it('the formula list shows the 🔎 «Поиск по составам» button as its first row', () => {
    const view = formulaListView(formulaDeps(), 0);
    const firstRow = view.keyboard.reply_markup.inline_keyboard[0]!;
    expect('text' in firstRow[0]! ? firstRow[0].text : '').toBe(messages.library.formulasSearch);
    expect('callback_data' in firstRow[0]! ? firstRow[0].callback_data : '').toBe('lib:fsearch');
  });

  it('formula results filter to formulas only — a herb-matching token never leaks a herb', () => {
    // «миро» matches the herb «Миробалан хебула» AND the formula «Миробалановая
    // формула»; only the formula may appear in the formula-scoped results.
    const view = formulaResultsView(formulaDeps(), {
      screen: 'formula-results',
      query: 'миро',
      page: 0,
    });
    expect(buttonData(view)).toContain('lib:formula:tib-formula-miro');
    expect(buttonData(view).some((d) => d.startsWith('lib:herb:'))).toBe(false);
    expect(buttonLabels(view)).not.toContain('Миробалан хебула');
  });

  it('a non-matching formula query shows nothingFound', () => {
    const view = formulaResultsView(formulaDeps(), {
      screen: 'formula-results',
      query: 'женьшень',
      page: 0,
    });
    expect(view.text).toBe(messages.search.nothingFound);
  });
});

describe('library text capture — formula-search routes to the formula-only results', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  type TextHandler = (ctx: Context, next: () => Promise<void>) => Promise<void>;
  const ANCHOR_ID = 77;

  /** Register the text capture against a stub, returning the captured handler. */
  function captureTextHandler(deps: BotDeps): TextHandler {
    let handler: TextHandler | undefined;
    const stub = {
      on: (_event: string, h: TextHandler) => {
        handler = h;
      },
    } as unknown as Telegraf;
    registerLibrarySearchTextCapture(stub, deps);
    if (handler === undefined) throw new Error('text handler not registered');
    return handler;
  }

  function makeCtx(userId: number, text: string): Context {
    return {
      state: { userId },
      chat: { id: 1 },
      message: { text },
      telegram: { editMessageText: () => Promise.resolve(true) },
    } as unknown as Context;
  }

  function seedSession(screen: 'search' | 'formula-search'): number {
    const userId = ensureUser('1', 'u');
    const session: AnchoredSession<{ screen: string; page: number }> = {
      anchor: { messageId: ANCHOR_ID },
      state: { screen, page: 0 },
    };
    saveSession(userId, 'library', session, SESSION_TTL_MS);
    return userId;
  }

  it('a query typed on the formula-search prompt parks the session on formula-results', async () => {
    const userId = seedSession('formula-search');
    const deps = formulaDeps();
    await captureTextHandler(deps)(makeCtx(userId, 'Миро'), () => Promise.resolve());

    const session = loadSession<AnchoredSession<{ screen: string; query?: string }>>(
      userId,
      'library',
    );
    expect(session?.state.screen).toBe('formula-results');
    expect(session?.state.query).toBe('миро');
  });

  it('a query typed on the global search prompt still parks on the mixed results', async () => {
    const userId = seedSession('search');
    const deps = formulaDeps();
    await captureTextHandler(deps)(makeCtx(userId, 'Миро'), () => Promise.resolve());

    const session = loadSession<AnchoredSession<{ screen: string }>>(userId, 'library');
    expect(session?.state.screen).toBe('results');
  });
});
