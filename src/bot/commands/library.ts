/**
 * 📚 Библиотека — the unified reference surface (Plan 009, ADR 009). One anchor
 * message, edited in place across screens:
 *
 *   hub → 🌿 Травы → (Все травы | По категории) → herb list → herb card
 *       → 💡 Случайный совет (in-anchor, random per tap — Plan 021)
 *       → 🧪 Составы (formula browser, live post sign-off — gated by `_formula-gate`;
 *         labelled «Составы» while code/ids keep the "formula/combination" vocabulary)
 *
 * Supersedes the old standalone `/browse` drilldown: the persistent-menu
 * 📚 Библиотека button and the `/browse` shortcut both land here, and the
 * notification "Открыть" CTA opens a herb card as a fresh library session
 * (`openHerbCardAnchor`). The herb card itself is rendered by the shared
 * `_herb-card` module so every entry point is identical (render-time disclaimer,
 * ADR 006).
 *
 * Callback scope `lib:` — `lib:herbs`, `lib:all`, `lib:bycat`,
 * `lib:cat:<id>`, `lib:catpg:<page>`, `lib:list:<page>`, `lib:herb:<id>`,
 * `lib:tips`, `lib:back`, `lib:home`. Each payload runs through
 * `assertCallbackData` and uses stable content ids (≤64 bytes).
 */

import { Markup, type Context, type Telegraf } from 'telegraf';

import {
  type Combination,
  type Food,
  type FoodGroup,
  FOOD_GROUPS,
  type Herb,
  type Warmth,
} from '../../content/types';
import type { BotDeps } from '../context';
import { getUserId } from '../context';
import { assertCallbackData, backRow, homeRow, pager } from '../keyboards';
import { messages } from '../messages';
import {
  type Anchor,
  editAnchor,
  editAnchorAt,
  editAnchorAtHtml,
  editAnchorHtml,
  sendAnchor,
  sendAnchorHtml,
} from '../render/anchor';
import { unsafeHtml } from '../render/html';
import { toPlainText } from '../render/markdown';
import {
  type AnchoredSession,
  deleteSession,
  loadSession,
  saveSession,
  SESSION_TTL_MS,
} from '../session-store';
import { type ValidatedCallback } from './_callback-prologue';
import { formulaCardKeyboard, formulaMemberLinks, renderFormula } from './_formula-card';
import { FORMULA_BRANCH_ENABLED } from './_formula-gate';
import { guideDisplayTitle, guidePages } from './_guide-card';
import { herbCardKeyboard, herbFormulaLinks, renderHerb } from './_herb-card';
import { onAck, onSession } from './_session-registrar';
import { getRecent, recordShown } from './tip-history';
import { pickRandomTip } from './tips';

const PAGE_SIZE = 8;

/** Which screen of the library drilldown is showing. */
type Screen =
  | 'hub'
  | 'herbs'
  | 'pick-category'
  | 'list'
  | 'card'
  | 'tips'
  | 'search'
  | 'results'
  | 'guide-list'
  | 'guide-section'
  | 'formula-list'
  | 'formula-search'
  | 'formula-results'
  | 'formula-card'
  | 'food-groups'
  | 'food-filter'
  | 'food-list'
  | 'food-card';

/** Which constitution a food filter pacifies (the canonical Ветер/Желчь/Слизь key). */
type FoodConstitution = 'wind' | 'bile' | 'phlegm';
/** Warmth band the warmth filter selects (тёплые vs прохладные). */
type FoodWarmthBand = 'warm' | 'cool';

/**
 * Library drilldown state. `category` xor `query` records how the current herb
 * list / results were reached (so `« Назад` from a card returns to the right
 * origin and a list returns to the right screen); a list reached with neither is
 * the flat «Все травы» list of all visible herbs (ADR 013, Tibetan-only). `page`
 * is the active list/results/picker page; `herbId` is set while a herb card is
 * open, `formulaId` while a formula card is open.
 */
interface LibraryState {
  readonly screen: Screen;
  readonly category?: string;
  /**
   * Marks a card whose origin is the flat «Все травы» list (no category/query),
   * so `« Назад` returns there rather than to the hub — the latter being the
   * fallback for a context-free card from the notification "Открыть" deep link.
   */
  readonly allList?: true;
  /** Normalized (lowercased) search query — set on the results/search screens. */
  readonly query?: string;
  readonly page: number;
  readonly herbId?: string;
  readonly formulaId?: string;
  /**
   * Marks a `formula-card` opened from the formula-only `formula-results` screen,
   * so `« Назад` returns to those results rather than the global mixed `results`
   * (both carry `query`; this discriminates origin). Set at card-open time from
   * the originating screen — the single source of truth for the back-state.
   */
  readonly formulaScope?: true;
  /** Open guide id (guide-section screen). */
  readonly guideId?: string;
  /** Active page index within the open guide (guide-section pager). */
  readonly section?: number;
  /**
   * How the current `food-list` was reached — exactly one of these is set, the
   * same xor that herb lists use for `category`/`query`: a group browse
   * (`foodGroup`), a constitution filter (`foodCon`, foods that pacify it), or a
   * warmth-band filter (`foodWarm`). They also mark a `food-card`'s origin so
   * `« Назад` returns to the right list/filter.
   */
  readonly foodGroup?: FoodGroup;
  readonly foodCon?: FoodConstitution;
  readonly foodWarm?: FoodWarmthBand;
  /** Open food id (food-card screen). */
  readonly foodId?: string;
}

interface View {
  readonly text: string;
  readonly keyboard: ReturnType<typeof Markup.inlineKeyboard>;
  /**
   * Opt-in HTML render discriminator (ADR 011) — when set, the anchor dispatch
   * uses the HTML-aware helper; omitted on every plain-text branch.
   */
  readonly html?: true;
}

type CallbackButton = ReturnType<typeof Markup.button.callback>;

// ─── view dispatch (plain vs HTML, ADR 011) ─────────────────────────────────────

// unsafeHtml is legitimate here: an html-flagged View's text was already minted
// through the escaping `html` template in renderFormula; View.text is the plain
// transport type. Plain Views go through the untouched plain helpers (ADR 011).
function sendView(ctx: Context, view: View): Promise<Anchor> {
  return view.html
    ? sendAnchorHtml(ctx, unsafeHtml(view.text), view.keyboard)
    : sendAnchor(ctx, view.text, view.keyboard);
}
function editView(ctx: Context, view: View): Promise<void> {
  return view.html
    ? editAnchorHtml(ctx, unsafeHtml(view.text), view.keyboard)
    : editAnchor(ctx, view.text, view.keyboard);
}
function editViewAt(ctx: Context, messageId: number, view: View): Promise<void> {
  return view.html
    ? editAnchorAtHtml(ctx, messageId, unsafeHtml(view.text), view.keyboard)
    : editAnchorAt(ctx, messageId, view.text, view.keyboard);
}

function persist(userId: number, anchor: Anchor, state: LibraryState): void {
  const session: AnchoredSession<LibraryState> = { anchor, state };
  saveSession(userId, 'library', session, SESSION_TTL_MS);
}

/**
 * Clamp a requested page into `[0, pageCount)` for a list of `itemCount` items.
 * Pure and exported so the pager never wraps past either end — a tap on an edge
 * page resolves to the same page (the `:noop` button it carries is a no-op).
 */
export function clampPage(
  page: number,
  itemCount: number,
  pageSize: number = PAGE_SIZE,
): { readonly page: number; readonly pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(itemCount / pageSize));
  return { page: Math.min(Math.max(page, 0), pageCount - 1), pageCount };
}

// ─── content helpers ──────────────────────────────────────────────────────────

/** Categories that group at least one herb, with their herb counts. */
function categoriesWithHerbs(deps: BotDeps): { id: string; nameRu: string; count: number }[] {
  return deps.content.categories.all
    .map((c) => ({
      id: c.id,
      nameRu: c.nameRu,
      count: deps.content.herbs.all.filter((h) => h.category === c.id).length,
    }))
    .filter((c) => c.count > 0);
}

/** Herbs in the list the state selects: by category, else the flat «Все травы»
 *  list of every visible herb (ADR 013 — the tradition axis was removed). */
function herbsFor(deps: BotDeps, state: LibraryState): readonly Herb[] {
  if (state.category !== undefined) {
    return deps.content.herbs.all.filter((h) => h.category === state.category);
  }
  return deps.content.herbs.all;
}

// ─── per-screen views ─────────────────────────────────────────────────────────

/** The library root. The 📖 Статьи (guides) branch ships with Plan 006; the
 *  `🧪 Составы` (formula) branch appears only once the doctor-gate is lifted
 *  (`_formula-gate`). Exported so a test can assert the formula branch presence. */
export function hubView(): View {
  // Branch order (Plan-driven): составы → ингредиенты → продукты → статьи →
  // поиск → случайный совет. Составы lead but only when the doctor-gate is
  // lifted (`_formula-gate`); otherwise the list opens on ингредиенты.
  const rows: CallbackButton[][] = [];
  if (FORMULA_BRANCH_ENABLED) {
    rows.push([Markup.button.callback(messages.library.formulas, 'lib:formulas')]);
  }
  rows.push(
    [Markup.button.callback(messages.library.herbs, 'lib:herbs')],
    [Markup.button.callback(messages.library.foods, 'lib:foods')],
    [Markup.button.callback(messages.library.guides, 'lib:guides')],
    [Markup.button.callback(messages.library.search, 'lib:search')],
    [Markup.button.callback(messages.library.tips, 'lib:tips')],
  );
  return {
    text: `${messages.library.title}\n\n${messages.library.intro}`,
    keyboard: Markup.inlineKeyboard(rows),
  };
}

function herbsMenuView(): View {
  return {
    text: messages.library.herbsTitle,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback(messages.library.allHerbs, 'lib:all')],
      [Markup.button.callback(messages.library.byCategory, 'lib:bycat')],
      backRow('lib:back'),
    ]),
  };
}

function categoryPickView(deps: BotDeps, page: number): View & { readonly page: number } {
  const cats = categoriesWithHerbs(deps);
  if (cats.length === 0) {
    return {
      text: messages.library.emptyCategories,
      keyboard: Markup.inlineKeyboard([backRow('lib:back')]),
      page: 0,
    };
  }
  const { page: safePage, pageCount } = clampPage(page, cats.length);
  const slice = cats.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const rows = slice.map((c) => [
    Markup.button.callback(
      messages.library.categoryButton(c.nameRu, c.count),
      assertCallbackData(`lib:cat:${c.id}`),
    ),
  ]);
  const nav: CallbackButton[][] = [];
  if (pageCount > 1) nav.push(pager('lib:catpg', safePage, pageCount));
  nav.push(backRow('lib:back'));
  return {
    text: messages.library.pickCategory,
    keyboard: Markup.inlineKeyboard([...rows, ...nav]),
    page: safePage,
  };
}

function listView(deps: BotDeps, state: LibraryState): View & { readonly page: number } {
  const herbs = herbsFor(deps, state);
  if (herbs.length === 0) {
    return {
      text: messages.library.emptyHerbs,
      keyboard: Markup.inlineKeyboard([backRow('lib:back')]),
      page: 0,
    };
  }
  const { page: safePage, pageCount } = clampPage(state.page, herbs.length);
  const slice = herbs.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const rows = slice.map((h) => [
    Markup.button.callback(h.nameRu, assertCallbackData(`lib:herb:${h.id}`)),
  ]);
  const nav: CallbackButton[][] = [];
  if (pageCount > 1) nav.push(pager('lib:list', safePage, pageCount));
  nav.push(backRow('lib:back'), homeRow('lib:home'));
  return {
    text: messages.browse.title,
    keyboard: Markup.inlineKeyboard([...rows, ...nav]),
    page: safePage,
  };
}

/** Herb card, or null when the id is unknown (stale tap / bad deep link). */
function cardView(deps: BotDeps, herbId: string): View | null {
  const herb = deps.content.herbs.byId.get(herbId);
  if (herb === undefined) return null;
  // Reverse cross-links — empty (section omitted) until the formula branch is
  // registered post sign-off (ADR 006 doctor-gate, `_formula-gate`).
  const links = herbFormulaLinks(herbId, deps.content, FORMULA_BRANCH_ENABLED);
  return {
    text: renderHerb(herb, links),
    keyboard: herbCardKeyboard(herbId, [backRow('lib:back'), homeRow('lib:home')], links),
  };
}

/**
 * The 💡 Случайный совет leaf — a random tip rendered into the anchor (Plan 021),
 * sharing the same per-user recent-history exclusion as `/tips` and the menu so
 * repeated visits don't immediately repeat. `userId` is `undefined` only when
 * ensure-user hasn't run (stateless fallback: still random, no exclusion).
 */
function tipsView(deps: BotDeps, userId: number | undefined): View {
  const exclude = userId === undefined ? new Set<string>() : getRecent(userId);
  const tip = pickRandomTip(deps.content.tips.all, exclude);
  if (tip === null) {
    return {
      text: messages.library.tipsEmpty,
      keyboard: Markup.inlineKeyboard([backRow('lib:back'), homeRow('lib:home')]),
    };
  }
  if (userId !== undefined) recordShown(userId, tip.id);
  return {
    text: messages.tip.random(toPlainText(tip.body), tip.source),
    keyboard: Markup.inlineKeyboard([backRow('lib:back'), homeRow('lib:home')]),
  };
}

// ─── search ───────────────────────────────────────────────────────────────────

/** A search result: a herb always, a formula only when the branch is registered. */
interface SearchHit {
  readonly kind: 'herb' | 'formula';
  readonly id: string;
  readonly name: string;
}

export function herbMatches(herb: Herb, q: string): boolean {
  return [herb.nameRu, herb.nameLatin, herb.nameOriginal]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(q);
}

export function formulaMatches(combination: Combination, q: string): boolean {
  return [combination.nameRu, combination.nameOriginal, ...combination.aliases]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(q);
}

/**
 * Case-insensitive substring search. Herbs always; formulas only once the
 * combinations branch is registered (ADR 006 doctor-gate) — so a withheld
 * formula can never surface as a search hit.
 */
export function searchHits(deps: BotDeps, query: string): SearchHit[] {
  const hits: SearchHit[] = deps.content.herbs.all
    .filter((h) => herbMatches(h, query))
    .map((h) => ({ kind: 'herb', id: h.id, name: h.nameRu }));
  if (FORMULA_BRANCH_ENABLED) {
    for (const c of deps.content.combinations.all) {
      if (formulaMatches(c, query)) hits.push({ kind: 'formula', id: c.id, name: c.nameRu });
    }
  }
  return hits;
}

/** The 🔎 Поиск prompt — typed queries are claimed by the text capture below. */
function searchPromptView(): View {
  return {
    text: messages.search.prompt,
    keyboard: Markup.inlineKeyboard([backRow('lib:back'), homeRow('lib:home')]),
  };
}

function resultsView(deps: BotDeps, state: LibraryState): View & { readonly page: number } {
  const hits = searchHits(deps, state.query ?? '');
  if (hits.length === 0) {
    return {
      text: messages.search.nothingFound,
      keyboard: Markup.inlineKeyboard([backRow('lib:back'), homeRow('lib:home')]),
      page: 0,
    };
  }
  const { page: safePage, pageCount } = clampPage(state.page, hits.length);
  const slice = hits.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const rows = slice.map((hit) => [
    Markup.button.callback(
      hit.name,
      assertCallbackData(hit.kind === 'herb' ? `lib:herb:${hit.id}` : `lib:formula:${hit.id}`),
    ),
  ]);
  const nav: CallbackButton[][] = [];
  if (pageCount > 1) nav.push(pager('lib:results', safePage, pageCount));
  nav.push(backRow('lib:back'), homeRow('lib:home'));
  return {
    text: messages.search.results,
    keyboard: Markup.inlineKeyboard([...rows, ...nav]),
    page: safePage,
  };
}

// ─── formulas (live post sign-off — _formula-gate; UI label «Составы») ────────

export function formulaListView(deps: BotDeps, page: number): View & { readonly page: number } {
  const formulas = deps.content.combinations.all;
  if (formulas.length === 0) {
    return {
      text: messages.library.formulasEmpty,
      keyboard: Markup.inlineKeyboard([backRow('lib:back')]),
      page: 0,
    };
  }
  const { page: safePage, pageCount } = clampPage(page, formulas.length);
  const slice = formulas.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  // 🔎 formula-only search sits as the first row, above the entries, on every page.
  const searchRow: CallbackButton[] = [
    Markup.button.callback(messages.library.formulasSearch, 'lib:fsearch'),
  ];
  const rows = slice.map((f) => [
    Markup.button.callback(f.nameRu, assertCallbackData(`lib:formula:${f.id}`)),
  ]);
  const nav: CallbackButton[][] = [];
  if (pageCount > 1) nav.push(pager('lib:flist', safePage, pageCount));
  nav.push(backRow('lib:back'), homeRow('lib:home'));
  return {
    text: messages.library.formulasTitle,
    keyboard: Markup.inlineKeyboard([searchRow, ...rows, ...nav]),
    page: safePage,
  };
}

/** The 🔎 Поиск по составам prompt — typed queries are claimed by the text capture. */
function formulaSearchPromptView(): View {
  return {
    text: messages.search.formulaPrompt,
    keyboard: Markup.inlineKeyboard([backRow('lib:back'), homeRow('lib:home')]),
  };
}

/** Formula-only results: filters combinations by `formulaMatches` — no herbs leak. */
export function formulaResultsView(
  deps: BotDeps,
  state: LibraryState,
): View & { readonly page: number } {
  const hits = deps.content.combinations.all.filter((c) => formulaMatches(c, state.query ?? ''));
  if (hits.length === 0) {
    return {
      text: messages.search.nothingFound,
      keyboard: Markup.inlineKeyboard([backRow('lib:back'), homeRow('lib:home')]),
      page: 0,
    };
  }
  const { page: safePage, pageCount } = clampPage(state.page, hits.length);
  const slice = hits.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const rows = slice.map((c) => [
    Markup.button.callback(c.nameRu, assertCallbackData(`lib:formula:${c.id}`)),
  ]);
  const nav: CallbackButton[][] = [];
  if (pageCount > 1) nav.push(pager('lib:fresults', safePage, pageCount));
  nav.push(backRow('lib:back'), homeRow('lib:home'));
  return {
    text: messages.search.results,
    keyboard: Markup.inlineKeyboard([...rows, ...nav]),
    page: safePage,
  };
}

/** Formula card, or null when the id is unknown (stale tap / bad deep link). */
function formulaCardView(deps: BotDeps, formulaId: string): View | null {
  const formula = deps.content.combinations.byId.get(formulaId);
  if (formula === undefined) return null;
  const links = formulaMemberLinks(formula, deps.content);
  return {
    text: renderFormula(formula),
    keyboard: formulaCardKeyboard(links, [backRow('lib:back'), homeRow('lib:home')]),
    html: true,
  };
}

// ─── guides (📖 Статьи — Plan 006) ────────────────────────────────────────────

function guideListView(deps: BotDeps, page: number): View & { readonly page: number } {
  const guides = deps.content.guides.all;
  if (guides.length === 0) {
    return {
      text: messages.library.guidesEmpty,
      keyboard: Markup.inlineKeyboard([backRow('lib:back'), homeRow('lib:home')]),
      page: 0,
    };
  }
  const { page: safePage, pageCount } = clampPage(page, guides.length);
  const slice = guides.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const rows = slice.map((g) => [
    Markup.button.callback(guideDisplayTitle(g), assertCallbackData(`lib:guide:${g.id}`)),
  ]);
  const nav: CallbackButton[][] = [];
  if (pageCount > 1) nav.push(pager('lib:glist', safePage, pageCount));
  nav.push(backRow('lib:back'), homeRow('lib:home'));
  return {
    text: messages.library.guidesTitle,
    keyboard: Markup.inlineKeyboard([...rows, ...nav]),
    page: safePage,
  };
}

/**
 * One page of an open guide. The guide is flattened into ≤-limit pages
 * (`guidePages`) and the pager steps through them; `page` carries the *list* page
 * to return to, while `section` is the active page index. An unknown id (stale
 * tap / bad deep link) falls back to the hub.
 */
function guideSectionView(
  deps: BotDeps,
  state: LibraryState,
): View & { readonly page: number; readonly section: number } {
  const guide = deps.content.guides.byId.get(state.guideId ?? '');
  if (guide === undefined) return { ...hubView(), page: 0, section: 0 };
  const pages = guidePages(guide);
  // pageSize 1: each guide page is its own pager step.
  const { page: safeSection, pageCount } = clampPage(state.section ?? 0, pages.length, 1);
  const nav: CallbackButton[][] = [];
  if (pageCount > 1) nav.push(pager('lib:gsec', safeSection, pageCount));
  nav.push(backRow('lib:back'), homeRow('lib:home'));
  return {
    text: pages[safeSection] ?? '',
    keyboard: Markup.inlineKeyboard(nav),
    page: state.page,
    section: safeSection,
  };
}

// ─── foods (🥗 Продукты — Plan 013, ADR 012) ──────────────────────────────────

/** Which warmth levels each band collects (нейтральная is in neither). */
const FOOD_WARMTH_BANDS: Record<FoodWarmthBand, readonly Warmth[]> = {
  warm: ['горячая', 'тёплая'],
  cool: ['прохладная', 'холодная'],
};

/** Map the compact constitution-filter slug (w|b|p) to its canonical key. */
const FOOD_CON_BY_SLUG: Record<string, FoodConstitution> = {
  w: 'wind',
  b: 'bile',
  p: 'phlegm',
};

/** The food groups that hold at least one food, in catalogue order, with counts. */
function foodGroupsPresent(deps: BotDeps): { group: FoodGroup; count: number }[] {
  return FOOD_GROUPS.map((group) => ({
    group,
    count: deps.content.foods.all.filter((f) => f.group === group).length,
  })).filter((g) => g.count > 0);
}

/** Foods the current `food-list` state selects — by group xor constitution xor
 *  warmth band, else (no facet) the whole catalogue. */
function foodsFor(deps: BotDeps, state: LibraryState): readonly Food[] {
  const all = deps.content.foods.all;
  if (state.foodGroup !== undefined) return all.filter((f) => f.group === state.foodGroup);
  if (state.foodCon !== undefined) {
    const con = state.foodCon;
    return all.filter((f) => f.constitutions[con] === 'pacifies');
  }
  if (state.foodWarm !== undefined) {
    const band = FOOD_WARMTH_BANDS[state.foodWarm];
    return all.filter((f) => band.includes(f.warmth));
  }
  return all;
}

/** Title for the active `food-list` (group name, constitution band, or warmth band). */
function foodListTitle(state: LibraryState): string {
  if (state.foodGroup !== undefined) return messages.foods.groupTitle(state.foodGroup);
  if (state.foodCon === 'wind') return messages.foods.filterWind;
  if (state.foodCon === 'bile') return messages.foods.filterBile;
  if (state.foodCon === 'phlegm') return messages.foods.filterPhlegm;
  if (state.foodWarm === 'warm') return messages.foods.warmTitle;
  if (state.foodWarm === 'cool') return messages.foods.coolTitle;
  return messages.library.foods;
}

/**
 * The whole group taxonomy fits on one screen (it is short and bounded by
 * `FOOD_GROUPS`), so it is never split into pages — unlike content lists, a
 * paginated navigation root is pure friction. The `lib:fglist` pager stays wired
 * but only ever fires if the taxonomy outgrows this; for now it never does.
 */
const FOOD_GROUPS_PAGE_SIZE = FOOD_GROUPS.length;

/** The 🥗 Продукты root: a filter entry then one button per non-empty group. */
export function foodGroupsView(deps: BotDeps, page: number): View & { readonly page: number } {
  const groups = foodGroupsPresent(deps);
  if (groups.length === 0) {
    return {
      text: messages.foods.emptyGroups,
      keyboard: Markup.inlineKeyboard([backRow('lib:back'), homeRow('lib:home')]),
      page: 0,
    };
  }
  const { page: safePage, pageCount } = clampPage(page, groups.length, FOOD_GROUPS_PAGE_SIZE);
  const slice = groups.slice(
    safePage * FOOD_GROUPS_PAGE_SIZE,
    safePage * FOOD_GROUPS_PAGE_SIZE + FOOD_GROUPS_PAGE_SIZE,
  );
  // The filter entry sits as the first row, above the groups, on every page.
  const filterRow: CallbackButton[] = [
    Markup.button.callback(messages.foods.filterEntry, 'lib:ffil'),
  ];
  const rows = slice.map((g) => [
    Markup.button.callback(
      messages.foods.groupButton(g.group, g.count),
      assertCallbackData(`lib:fg:${g.group}`),
    ),
  ]);
  const nav: CallbackButton[][] = [];
  if (pageCount > 1) nav.push(pager('lib:fglist', safePage, pageCount));
  nav.push(backRow('lib:back'), homeRow('lib:home'));
  return {
    text: messages.foods.groupsTitle,
    keyboard: Markup.inlineKeyboard([filterRow, ...rows, ...nav]),
    page: safePage,
  };
}

/** The filter screen: pick a начало to pacify, or a warmth band. */
function foodFilterView(): View {
  return {
    text: messages.foods.filterTitle,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback(messages.foods.filterWind, 'lib:fcon:w')],
      [Markup.button.callback(messages.foods.filterBile, 'lib:fcon:b')],
      [Markup.button.callback(messages.foods.filterPhlegm, 'lib:fcon:p')],
      [Markup.button.callback(messages.foods.filterWarm, 'lib:fwarm:warm')],
      [Markup.button.callback(messages.foods.filterCool, 'lib:fwarm:cool')],
      backRow('lib:back'),
      homeRow('lib:home'),
    ]),
  };
}

export function foodListView(deps: BotDeps, state: LibraryState): View & { readonly page: number } {
  const foods = foodsFor(deps, state);
  if (foods.length === 0) {
    return {
      text: messages.foods.emptyList,
      keyboard: Markup.inlineKeyboard([backRow('lib:back'), homeRow('lib:home')]),
      page: 0,
    };
  }
  const { page: safePage, pageCount } = clampPage(state.page, foods.length);
  const slice = foods.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const rows = slice.map((f) => [
    Markup.button.callback(f.nameRu, assertCallbackData(`lib:food:${f.id}`)),
  ]);
  const nav: CallbackButton[][] = [];
  if (pageCount > 1) nav.push(pager('lib:flpg', safePage, pageCount));
  nav.push(backRow('lib:back'), homeRow('lib:home'));
  return {
    text: foodListTitle(state),
    keyboard: Markup.inlineKeyboard([...rows, ...nav]),
    page: safePage,
  };
}

/** Food card, or null when the id is unknown (stale tap / bad deep link). */
function foodCardView(deps: BotDeps, foodId: string): View | null {
  const food = deps.content.foods.byId.get(foodId);
  if (food === undefined) return null;
  return {
    text: messages.foods.card(food),
    keyboard: Markup.inlineKeyboard([backRow('lib:back'), homeRow('lib:home')]),
  };
}

/**
 * Render whichever screen `state` names, clamping page where it paginates.
 * `userId` is threaded through only for the `tips` screen, whose render is a
 * random pick that records into the user's recent-tip history (Plan 021); every
 * other screen ignores it.
 */
function viewFor(
  deps: BotDeps,
  state: LibraryState,
  userId: number | undefined,
): View & { readonly page: number; readonly section?: number } {
  switch (state.screen) {
    case 'herbs':
      return { ...herbsMenuView(), page: 0 };
    case 'pick-category':
      return categoryPickView(deps, state.page);
    case 'list':
      return listView(deps, state);
    case 'tips':
      return { ...tipsView(deps, userId), page: 0 };
    case 'search':
      return { ...searchPromptView(), page: 0 };
    case 'results':
      return resultsView(deps, state);
    case 'guide-list':
      return guideListView(deps, state.page);
    case 'guide-section':
      return guideSectionView(deps, state);
    case 'formula-list':
      return formulaListView(deps, state.page);
    case 'formula-search':
      return { ...formulaSearchPromptView(), page: 0 };
    case 'formula-results':
      return formulaResultsView(deps, state);
    case 'formula-card': {
      const card = formulaCardView(deps, state.formulaId ?? '');
      return card === null ? { ...hubView(), page: 0 } : { ...card, page: state.page };
    }
    case 'card': {
      const card = cardView(deps, state.herbId ?? '');
      return card === null ? { ...hubView(), page: 0 } : { ...card, page: state.page };
    }
    case 'food-groups':
      return foodGroupsView(deps, state.page);
    case 'food-filter':
      return { ...foodFilterView(), page: 0 };
    case 'food-list':
      return foodListView(deps, state);
    case 'food-card': {
      const card = foodCardView(deps, state.foodId ?? '');
      return card === null ? { ...hubView(), page: 0 } : { ...card, page: state.page };
    }
    case 'hub':
    default:
      return { ...hubView(), page: 0 };
  }
}

/** The screen `« Назад` returns to from `state`. Exported for navigation tests. */
export function backState(state: LibraryState): LibraryState {
  switch (state.screen) {
    case 'card':
      // Back to the originating screen: search results, then a herb list, else
      // the hub (a context-free card from the notification "Открыть" deep link).
      if (state.query !== undefined) {
        return { screen: 'results', query: state.query, page: state.page };
      }
      if (state.category !== undefined) {
        return { screen: 'list', page: state.page, category: state.category };
      }
      // A card from the flat «Все травы» list returns to that list; a context-free
      // card (notification deep link) carries no origin marker and falls to hub.
      if (state.allList === true) {
        return { screen: 'list', page: state.page };
      }
      return { screen: 'hub', page: 0 };
    case 'list':
      // The category list returns to the category picker; the flat «Все травы»
      // list returns to the herbs sub-menu.
      return state.category !== undefined
        ? { screen: 'pick-category', page: 0 }
        : { screen: 'herbs', page: 0 };
    case 'pick-category':
      return { screen: 'herbs', page: 0 };
    case 'results':
      return { screen: 'search', page: 0 };
    case 'guide-section':
      // Back to the guide list, restoring the list page the guide was opened from.
      return { screen: 'guide-list', page: state.page };
    case 'formula-card':
      // Origin precedence: the formula-only results (formulaScope + query), then
      // the global mixed results (query alone), else the flat formula list.
      if (state.formulaScope === true && state.query !== undefined) {
        return { screen: 'formula-results', query: state.query, page: state.page };
      }
      if (state.query !== undefined) {
        return { screen: 'results', query: state.query, page: state.page };
      }
      return { screen: 'formula-list', page: state.page };
    case 'formula-results':
      return { screen: 'formula-search', page: 0 };
    case 'formula-search':
      return { screen: 'formula-list', page: 0 };
    case 'food-card':
      // Back to the originating list, restoring its facet (group xor constitution
      // xor warmth) and page so the list reappears exactly as it was left.
      return {
        screen: 'food-list',
        page: state.page,
        ...(state.foodGroup !== undefined
          ? { foodGroup: state.foodGroup }
          : state.foodCon !== undefined
            ? { foodCon: state.foodCon }
            : state.foodWarm !== undefined
              ? { foodWarm: state.foodWarm }
              : {}),
      };
    case 'food-list':
      // A group list returns to the groups screen; a filter list to the filter screen.
      return state.foodGroup !== undefined
        ? { screen: 'food-groups', page: 0 }
        : { screen: 'food-filter', page: 0 };
    case 'food-filter':
      return { screen: 'food-groups', page: 0 };
    case 'formula-list':
    case 'guide-list':
    case 'food-groups':
    case 'herbs':
    case 'tips':
    case 'search':
    default:
      return { screen: 'hub', page: 0 };
  }
}

// ─── entry points ─────────────────────────────────────────────────────────────

/** Open the library hub as a fresh anchored session. Menu + `/library`. */
export async function libraryEntry(ctx: Context): Promise<void> {
  const userId = getUserId(ctx);
  if (userId === undefined) {
    await ctx.reply(messages.common.notRegistered);
    return;
  }
  deleteSession(userId, 'library');
  const view = hubView();
  const anchor = await sendView(ctx, view);
  persist(userId, anchor, { screen: 'hub', page: 0 });
}

/** Open the 🌿 Травы sub-menu directly — the `/browse` shortcut lands here. */
export async function libraryHerbsEntry(ctx: Context): Promise<void> {
  const userId = getUserId(ctx);
  if (userId === undefined) {
    await ctx.reply(messages.common.notRegistered);
    return;
  }
  deleteSession(userId, 'library');
  const view = herbsMenuView();
  const anchor = await sendView(ctx, view);
  persist(userId, anchor, { screen: 'herbs', page: 0 });
}

/**
 * Open the 🔎 Поиск branch as a fresh library session. With a query (the
 * `/search <query>` shortcut) it lands straight on the results; without one it
 * shows the prompt and the text capture claims the next typed message.
 */
export async function librarySearchEntry(
  ctx: Context,
  deps: BotDeps,
  rawQuery?: string,
): Promise<void> {
  const userId = getUserId(ctx);
  if (userId === undefined) {
    await ctx.reply(messages.common.notRegistered);
    return;
  }
  deleteSession(userId, 'library');
  const query = (rawQuery ?? '').trim().toLowerCase();
  const state: LibraryState =
    query === '' ? { screen: 'search', page: 0 } : { screen: 'results', query, page: 0 };
  const out = viewFor(deps, state, userId);
  const anchor = await sendView(ctx, out);
  persist(userId, anchor, { ...state, page: out.page });
}

/** Open the 📖 Статьи guide list as a fresh library session. Menu + `/guides`. */
export async function libraryGuidesEntry(ctx: Context, deps: BotDeps): Promise<void> {
  const userId = getUserId(ctx);
  if (userId === undefined) {
    await ctx.reply(messages.common.notRegistered);
    return;
  }
  deleteSession(userId, 'library');
  const out = viewFor(deps, { screen: 'guide-list', page: 0 }, userId);
  const anchor = await sendView(ctx, out);
  persist(userId, anchor, { screen: 'guide-list', page: out.page });
}

/** Open the 🥗 Продукты groups screen as a fresh library session. Menu + `/foods`. */
export async function libraryFoodsEntry(ctx: Context, deps: BotDeps): Promise<void> {
  const userId = getUserId(ctx);
  if (userId === undefined) {
    await ctx.reply(messages.common.notRegistered);
    return;
  }
  deleteSession(userId, 'library');
  const out = viewFor(deps, { screen: 'food-groups', page: 0 }, userId);
  const anchor = await sendView(ctx, out);
  persist(userId, anchor, { screen: 'food-groups', page: out.page });
}

/**
 * Open a herb card as a fresh library session — the notification "Открыть" CTA.
 * Back lands on the hub (the card carries no list context).
 */
export async function openHerbCardAnchor(
  ctx: Context,
  deps: BotDeps,
  herbId: string,
): Promise<void> {
  const userId = getUserId(ctx);
  if (userId === undefined) {
    await ctx.reply(messages.common.notRegistered);
    return;
  }
  const view = cardView(deps, herbId);
  if (view === null) {
    await ctx.reply(messages.common.sessionExpired);
    return;
  }
  deleteSession(userId, 'library');
  const anchor = await sendView(ctx, view);
  persist(userId, anchor, { screen: 'card', page: 0, herbId });
}

/**
 * Open a formula card as a fresh library session — the formula-reminder "Открыть"
 * CTA (plan 024). Mirrors {@link openHerbCardAnchor}; back lands on the formula
 * list (the card carries no list context). Only ever reached while the formula
 * branch is live (`FORMULA_BRANCH_ENABLED`), as a formula CTA is only attached to
 * formula-linked reminders, which exist only once the branch is up.
 */
export async function openFormulaCardAnchor(
  ctx: Context,
  deps: BotDeps,
  formulaId: string,
): Promise<void> {
  const userId = getUserId(ctx);
  if (userId === undefined) {
    await ctx.reply(messages.common.notRegistered);
    return;
  }
  const view = formulaCardView(deps, formulaId);
  if (view === null) {
    await ctx.reply(messages.common.sessionExpired);
    return;
  }
  deleteSession(userId, 'library');
  const anchor = await sendView(ctx, view);
  persist(userId, anchor, { screen: 'formula-card', page: 0, formulaId });
}

// ─── registration ─────────────────────────────────────────────────────────────

export function registerLibraryCommand(bot: Telegraf, deps: BotDeps): void {
  /** Edit the anchor to `next`, clamping its page/section, and persist. */
  const go = async (
    ctx: Context,
    v: ValidatedCallback<LibraryState>,
    next: LibraryState,
  ): Promise<void> => {
    const out = viewFor(deps, next, v.userId);
    await editView(ctx, out);
    persist(v.userId, v.session.anchor, {
      ...next,
      page: out.page,
      ...(out.section !== undefined ? { section: out.section } : {}),
    });
  };

  bot.command('library', libraryEntry);
  bot.command('browse', libraryHerbsEntry);
  bot.command('guides', (ctx) => libraryGuidesEntry(ctx, deps));
  bot.command('foods', (ctx) => libraryFoodsEntry(ctx, deps));
  bot.command('search', async (ctx) => {
    const raw = ctx.message.text.replace(/^\/search(@\w+)?\s*/i, '');
    await librarySearchEntry(ctx, deps, raw);
  });

  onSession<LibraryState>(bot, /^lib:herbs$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'herbs', page: 0 }),
  );

  onSession<LibraryState>(bot, /^lib:all$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'list', page: 0 }),
  );

  onSession<LibraryState>(bot, /^lib:bycat$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'pick-category', page: 0 }),
  );

  onSession<LibraryState>(bot, /^lib:cat:(.+)$/, 'library', async (ctx, v) => {
    const category = ctx.match[1] ?? '';
    if (!deps.content.categories.byId.has(category)) return;
    await go(ctx, v, { screen: 'list', category, page: 0 });
  });

  onSession<LibraryState>(bot, /^lib:catpg:(\d+)$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'pick-category', page: Number(ctx.match[1] ?? '0') }),
  );

  onAck(bot, /^lib:catpg:noop$/);

  onSession<LibraryState>(bot, /^lib:list:(\d+)$/, 'library', (ctx, v) => {
    const { category } = v.session.state;
    return go(ctx, v, {
      screen: 'list',
      page: Number(ctx.match[1] ?? '0'),
      ...(category !== undefined ? { category } : {}),
    });
  });

  onAck(bot, /^lib:list:noop$/);

  onSession<LibraryState>(bot, /^lib:herb:(.+)$/, 'library', (ctx, v) => {
    const { category, query, page } = v.session.state;
    return go(ctx, v, {
      screen: 'card',
      herbId: ctx.match[1] ?? '',
      page,
      // Carry the origin so `« Назад` returns to the right screen: search results,
      // a category list, else the flat «Все травы» list (the only remaining list).
      ...(query !== undefined
        ? { query }
        : category !== undefined
          ? { category }
          : { allList: true }),
    });
  });

  onSession<LibraryState>(bot, /^lib:search$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'search', page: 0 }),
  );

  onSession<LibraryState>(bot, /^lib:results:(\d+)$/, 'library', async (ctx, v) => {
    const { query } = v.session.state;
    if (query === undefined) return;
    await go(ctx, v, { screen: 'results', query, page: Number(ctx.match[1] ?? '0') });
  });

  onAck(bot, /^lib:results:noop$/);

  // 📖 Статьи — the guides branch (Plan 006). Always registered.
  onSession<LibraryState>(bot, /^lib:guides$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'guide-list', page: 0 }),
  );

  onSession<LibraryState>(bot, /^lib:glist:(\d+)$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'guide-list', page: Number(ctx.match[1] ?? '0') }),
  );

  onAck(bot, /^lib:glist:noop$/);

  onSession<LibraryState>(bot, /^lib:guide:(.+)$/, 'library', async (ctx, v) => {
    const guideId = ctx.match[1] ?? '';
    if (!deps.content.guides.byId.has(guideId)) return;
    // Carry the current list page so `« Назад` returns to it.
    await go(ctx, v, {
      screen: 'guide-section',
      guideId,
      section: 0,
      page: v.session.state.page,
    });
  });

  onSession<LibraryState>(bot, /^lib:gsec:(\d+)$/, 'library', async (ctx, v) => {
    const { guideId, page } = v.session.state;
    if (guideId === undefined) return;
    await go(ctx, v, {
      screen: 'guide-section',
      guideId,
      section: Number(ctx.match[1] ?? '0'),
      page,
    });
  });

  onAck(bot, /^lib:gsec:noop$/);

  // 🥗 Продукты — the foods browse + filter branch (Plan 013, ADR 012). Always
  // registered; reads from the in-memory `foods` bucket like every other branch.
  onSession<LibraryState>(bot, /^lib:foods$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'food-groups', page: 0 }),
  );

  onSession<LibraryState>(bot, /^lib:fglist:(\d+)$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'food-groups', page: Number(ctx.match[1] ?? '0') }),
  );

  onAck(bot, /^lib:fglist:noop$/);

  onSession<LibraryState>(bot, /^lib:fg:(.+)$/, 'library', async (ctx, v) => {
    const group = ctx.match[1] ?? '';
    if (!FOOD_GROUPS.includes(group as FoodGroup)) return;
    await go(ctx, v, { screen: 'food-list', foodGroup: group as FoodGroup, page: 0 });
  });

  onSession<LibraryState>(bot, /^lib:ffil$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'food-filter', page: 0 }),
  );

  onSession<LibraryState>(bot, /^lib:fcon:(w|b|p)$/, 'library', async (ctx, v) => {
    const foodCon = FOOD_CON_BY_SLUG[ctx.match[1] ?? ''];
    if (foodCon === undefined) return;
    await go(ctx, v, { screen: 'food-list', foodCon, page: 0 });
  });

  onSession<LibraryState>(bot, /^lib:fwarm:(warm|cool)$/, 'library', (ctx, v) => {
    const foodWarm = ctx.match[1] === 'warm' ? 'warm' : 'cool';
    return go(ctx, v, { screen: 'food-list', foodWarm, page: 0 });
  });

  onSession<LibraryState>(bot, /^lib:flpg:(\d+)$/, 'library', (ctx, v) => {
    // Carry whichever facet selected this list so the page stays on the same set.
    const { foodGroup, foodCon, foodWarm } = v.session.state;
    return go(ctx, v, {
      screen: 'food-list',
      page: Number(ctx.match[1] ?? '0'),
      ...(foodGroup !== undefined
        ? { foodGroup }
        : foodCon !== undefined
          ? { foodCon }
          : foodWarm !== undefined
            ? { foodWarm }
            : {}),
    });
  });

  onAck(bot, /^lib:flpg:noop$/);

  onSession<LibraryState>(bot, /^lib:food:(.+)$/, 'library', async (ctx, v) => {
    const foodId = ctx.match[1] ?? '';
    if (!deps.content.foods.byId.has(foodId)) return;
    // Carry the originating facet + page so `« Назад` returns to the right list.
    const { foodGroup, foodCon, foodWarm, page } = v.session.state;
    await go(ctx, v, {
      screen: 'food-card',
      foodId,
      page,
      ...(foodGroup !== undefined
        ? { foodGroup }
        : foodCon !== undefined
          ? { foodCon }
          : foodWarm !== undefined
            ? { foodWarm }
            : {}),
    });
  });

  // 🧪 Составы (formulas) — built but registered ONLY when the doctor-gate is
  // lifted (ADR 006, `_formula-gate`). While withheld, these handlers (including
  // the formula-only search `lib:fsearch`/`lib:fresults`) are never wired, so even
  // a hand-crafted `lib:formula:*` / `lib:fsearch` callback falls through to a no-op.
  if (FORMULA_BRANCH_ENABLED) {
    onSession<LibraryState>(bot, /^lib:formulas$/, 'library', (ctx, v) =>
      go(ctx, v, { screen: 'formula-list', page: 0 }),
    );

    onSession<LibraryState>(bot, /^lib:flist:(\d+)$/, 'library', (ctx, v) =>
      go(ctx, v, { screen: 'formula-list', page: Number(ctx.match[1] ?? '0') }),
    );

    onAck(bot, /^lib:flist:noop$/);

    // 🔎 Поиск по составам — the formula-only search prompt (Plan 017).
    onSession<LibraryState>(bot, /^lib:fsearch$/, 'library', (ctx, v) =>
      go(ctx, v, { screen: 'formula-search', page: 0 }),
    );

    onSession<LibraryState>(bot, /^lib:fresults:(\d+)$/, 'library', async (ctx, v) => {
      const { query } = v.session.state;
      if (query === undefined) return;
      await go(ctx, v, { screen: 'formula-results', query, page: Number(ctx.match[1] ?? '0') });
    });

    onAck(bot, /^lib:fresults:noop$/);

    onSession<LibraryState>(bot, /^lib:formula:(.+)$/, 'library', async (ctx, v) => {
      const formulaId = ctx.match[1] ?? '';
      if (!deps.content.combinations.byId.has(formulaId)) return;
      const { query, page, screen } = v.session.state;
      await go(ctx, v, {
        screen: 'formula-card',
        formulaId,
        page,
        // Carry a search origin so `« Назад` returns to the results; mark
        // formula-only origin so it returns to the formula results, not the
        // global mixed ones.
        ...(query !== undefined ? { query } : {}),
        ...(screen === 'formula-results' ? { formulaScope: true } : {}),
      });
    });
  }

  onSession<LibraryState>(bot, /^lib:tips$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'tips', page: 0 }),
  );

  onSession<LibraryState>(bot, /^lib:back$/, 'library', (ctx, v) =>
    go(ctx, v, backState(v.session.state)),
  );

  onSession<LibraryState>(bot, /^lib:home$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'hub', page: 0 }),
  );
}

/**
 * Free-text search-query capture. Registered **after** the menu router so a menu
 * tap (handled by `bot.hears`) wins; this consumes a plain text message only
 * while the library session is parked on the `search` prompt (→ global `results`)
 * or the `formula-search` prompt (→ formula-only `formula-results`), editing the
 * anchor into the matching results, and calls `next()` otherwise so it never
 * swallows unrelated messages (mirrors the reminder-create / feedback captures).
 */
export function registerLibrarySearchTextCapture(bot: Telegraf, deps: BotDeps): void {
  bot.on('text', async (ctx, next) => {
    const userId = getUserId(ctx);
    if (userId === undefined) {
      await next();
      return;
    }
    const session = loadSession<AnchoredSession<LibraryState>>(userId, 'library');
    const parked = session?.state.screen;
    if (session === null || (parked !== 'search' && parked !== 'formula-search')) {
      await next();
      return;
    }
    const msg = ctx.message;
    const raw = msg !== undefined && 'text' in msg ? msg.text.trim() : '';
    if (raw === '') {
      await next();
      return;
    }
    const query = raw.toLowerCase();
    const state: LibraryState =
      parked === 'formula-search'
        ? { screen: 'formula-results', query, page: 0 }
        : { screen: 'results', query, page: 0 };
    const out = viewFor(deps, state, userId);
    await editViewAt(ctx, session.anchor.messageId, out);
    persist(userId, session.anchor, { ...state, page: out.page });
  });
}
