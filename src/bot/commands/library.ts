/**
 * 📚 Библиотека — the unified reference surface (Plan 009, ADR 009). One anchor
 * message, edited in place across screens:
 *
 *   hub → 🌿 Травы → (По традиции | По категории) → herb list → herb card
 *       → 💡 Совет дня (in-anchor)
 *       → 🧪 Формулы (built but withheld — Phase 5, gated by `_formula-gate`)
 *
 * Supersedes the old standalone `/browse` drilldown: the persistent-menu
 * 📚 Библиотека button and the `/browse` shortcut both land here, and the
 * notification "Открыть" CTA opens a herb card as a fresh library session
 * (`openHerbCardAnchor`). The herb card itself is rendered by the shared
 * `_herb-card` module so every entry point is identical (render-time disclaimer,
 * ADR 006).
 *
 * Callback scope `lib:` — `lib:herbs`, `lib:bytrad`, `lib:bycat`, `lib:tr:<t>`,
 * `lib:cat:<id>`, `lib:catpg:<page>`, `lib:list:<page>`, `lib:herb:<id>`,
 * `lib:tips`, `lib:back`, `lib:home`. Each payload runs through
 * `assertCallbackData` and uses stable content ids (≤64 bytes).
 */

import { Markup, type Context, type Telegraf } from 'telegraf';

import type { Combination, Herb, Tradition } from '../../content/types';
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
import { requireSessionAndAnchor, type ValidatedCallback } from './_callback-prologue';
import { formulaCardKeyboard, formulaMemberLinks, renderFormula } from './_formula-card';
import { FORMULA_BRANCH_ENABLED } from './_formula-gate';
import { guidePages } from './_guide-card';
import { herbCardKeyboard, herbFormulaLinks, renderHerb } from './_herb-card';
import { pickDailyTip } from './tips';

const PAGE_SIZE = 8;

/** Which screen of the library drilldown is showing. */
type Screen =
  | 'hub'
  | 'herbs'
  | 'pick-tradition'
  | 'pick-category'
  | 'list'
  | 'card'
  | 'tips'
  | 'search'
  | 'results'
  | 'guide-list'
  | 'guide-section'
  | 'formula-list'
  | 'formula-card';

/**
 * Library drilldown state. `tradition` xor `category` xor `query` records how
 * the current herb list / results were reached (so `« Назад` from a card returns
 * to the right origin and a list returns to the right picker); `page` is the
 * active list/results/picker page; `herbId` is set while a herb card is open,
 * `formulaId` while a formula card is open (withheld branch, Phase 5).
 */
interface LibraryState {
  readonly screen: Screen;
  readonly tradition?: Tradition;
  readonly category?: string;
  /** Normalized (lowercased) search query — set on the results/search screens. */
  readonly query?: string;
  readonly page: number;
  readonly herbId?: string;
  readonly formulaId?: string;
  /** Open guide id (guide-section screen). */
  readonly guideId?: string;
  /** Active page index within the open guide (guide-section pager). */
  readonly section?: number;
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

/** Herbs in the list the state selects (by category, else by tradition, else none). */
function herbsFor(deps: BotDeps, state: LibraryState): readonly Herb[] {
  if (state.category !== undefined) {
    return deps.content.herbs.all.filter((h) => h.category === state.category);
  }
  if (state.tradition !== undefined) {
    return deps.content.herbs.all.filter((h) => h.tradition === state.tradition);
  }
  return [];
}

// ─── per-screen views ─────────────────────────────────────────────────────────

/** The library root. The 📖 Статьи (guides) branch ships with Plan 006; the
 *  `🧪 Формулы` branch appears only once the doctor-gate is lifted
 *  (`_formula-gate`). Exported so a test can assert the formula branch presence. */
export function hubView(): View {
  const rows: CallbackButton[][] = [
    [Markup.button.callback(messages.library.herbs, 'lib:herbs')],
    [Markup.button.callback(messages.library.search, 'lib:search')],
    [Markup.button.callback(messages.library.tips, 'lib:tips')],
    [Markup.button.callback(messages.library.guides, 'lib:guides')],
  ];
  if (FORMULA_BRANCH_ENABLED) {
    rows.push([Markup.button.callback(messages.library.formulas, 'lib:formulas')]);
  }
  return {
    text: `${messages.library.title}\n\n${messages.library.intro}`,
    keyboard: Markup.inlineKeyboard(rows),
  };
}

function herbsMenuView(): View {
  return {
    text: messages.library.herbsTitle,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback(messages.library.byTradition, 'lib:bytrad')],
      [Markup.button.callback(messages.library.byCategory, 'lib:bycat')],
      backRow('lib:back'),
    ]),
  };
}

function traditionPickView(): View {
  return {
    text: messages.library.pickTradition,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback(messages.browse.chinese, 'lib:tr:chinese')],
      [Markup.button.callback(messages.browse.tibetan, 'lib:tr:tibetan')],
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

/** The 💡 Совет дня leaf — today's tip rendered into the anchor. */
function tipsView(deps: BotDeps): View {
  const tip = pickDailyTip(deps.content.tips.all);
  const text =
    tip === null
      ? messages.library.tipsEmpty
      : messages.tip.daily(toPlainText(tip.body), tip.source);
  return {
    text,
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

// ─── formulas (withheld until sign-off — _formula-gate) ───────────────────────

function formulaListView(deps: BotDeps, page: number): View & { readonly page: number } {
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
  const rows = slice.map((f) => [
    Markup.button.callback(f.nameRu, assertCallbackData(`lib:formula:${f.id}`)),
  ]);
  const nav: CallbackButton[][] = [];
  if (pageCount > 1) nav.push(pager('lib:flist', safePage, pageCount));
  nav.push(backRow('lib:back'), homeRow('lib:home'));
  return {
    text: messages.library.formulasTitle,
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
    Markup.button.callback(g.title, assertCallbackData(`lib:guide:${g.id}`)),
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

/** Render whichever screen `state` names, clamping page where it paginates. */
function viewFor(
  deps: BotDeps,
  state: LibraryState,
): View & { readonly page: number; readonly section?: number } {
  switch (state.screen) {
    case 'herbs':
      return { ...herbsMenuView(), page: 0 };
    case 'pick-tradition':
      return { ...traditionPickView(), page: 0 };
    case 'pick-category':
      return categoryPickView(deps, state.page);
    case 'list':
      return listView(deps, state);
    case 'tips':
      return { ...tipsView(deps), page: 0 };
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
    case 'formula-card': {
      const card = formulaCardView(deps, state.formulaId ?? '');
      return card === null ? { ...hubView(), page: 0 } : { ...card, page: state.page };
    }
    case 'card': {
      const card = cardView(deps, state.herbId ?? '');
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
      if (state.tradition !== undefined || state.category !== undefined) {
        return {
          screen: 'list',
          page: state.page,
          ...(state.tradition !== undefined ? { tradition: state.tradition } : {}),
          ...(state.category !== undefined ? { category: state.category } : {}),
        };
      }
      return { screen: 'hub', page: 0 };
    case 'list':
      return state.category !== undefined
        ? { screen: 'pick-category', page: 0 }
        : { screen: 'pick-tradition', page: 0 };
    case 'pick-tradition':
    case 'pick-category':
      return { screen: 'herbs', page: 0 };
    case 'results':
      return { screen: 'search', page: 0 };
    case 'guide-section':
      // Back to the guide list, restoring the list page the guide was opened from.
      return { screen: 'guide-list', page: state.page };
    case 'formula-card':
      // Back to search results (if reached from a search hit) else the formula list.
      return state.query !== undefined
        ? { screen: 'results', query: state.query, page: state.page }
        : { screen: 'formula-list', page: state.page };
    case 'formula-list':
    case 'guide-list':
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
  const out = viewFor(deps, state);
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
  const out = viewFor(deps, { screen: 'guide-list', page: 0 });
  const anchor = await sendView(ctx, out);
  persist(userId, anchor, { screen: 'guide-list', page: out.page });
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

// ─── registration ─────────────────────────────────────────────────────────────

export function registerLibraryCommand(bot: Telegraf, deps: BotDeps): void {
  /** Edit the anchor to `next`, clamping its page/section, and persist. */
  const go = async (
    ctx: Context,
    v: ValidatedCallback<LibraryState>,
    next: LibraryState,
  ): Promise<void> => {
    const out = viewFor(deps, next);
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
  bot.command('search', async (ctx) => {
    const raw = ctx.message.text.replace(/^\/search(@\w+)?\s*/i, '');
    await librarySearchEntry(ctx, deps, raw);
  });

  bot.action(/^lib:herbs$/, async (ctx) => {
    const v = await requireSessionAndAnchor<LibraryState>(ctx, 'library');
    if (v === null) return;
    await ctx.answerCbQuery();
    await go(ctx, v, { screen: 'herbs', page: 0 });
  });

  bot.action(/^lib:bytrad$/, async (ctx) => {
    const v = await requireSessionAndAnchor<LibraryState>(ctx, 'library');
    if (v === null) return;
    await ctx.answerCbQuery();
    await go(ctx, v, { screen: 'pick-tradition', page: 0 });
  });

  bot.action(/^lib:bycat$/, async (ctx) => {
    const v = await requireSessionAndAnchor<LibraryState>(ctx, 'library');
    if (v === null) return;
    await ctx.answerCbQuery();
    await go(ctx, v, { screen: 'pick-category', page: 0 });
  });

  bot.action(/^lib:tr:(chinese|tibetan)$/, async (ctx) => {
    const v = await requireSessionAndAnchor<LibraryState>(ctx, 'library');
    if (v === null) return;
    await ctx.answerCbQuery();
    await go(ctx, v, { screen: 'list', tradition: ctx.match[1] as Tradition, page: 0 });
  });

  bot.action(/^lib:cat:(.+)$/, async (ctx) => {
    const v = await requireSessionAndAnchor<LibraryState>(ctx, 'library');
    if (v === null) return;
    await ctx.answerCbQuery();
    const category = ctx.match[1] ?? '';
    if (!deps.content.categories.byId.has(category)) return;
    await go(ctx, v, { screen: 'list', category, page: 0 });
  });

  bot.action(/^lib:catpg:(\d+)$/, async (ctx) => {
    const v = await requireSessionAndAnchor<LibraryState>(ctx, 'library');
    if (v === null) return;
    await ctx.answerCbQuery();
    await go(ctx, v, { screen: 'pick-category', page: Number(ctx.match[1] ?? '0') });
  });

  bot.action(/^lib:catpg:noop$/, (ctx) => ctx.answerCbQuery());

  bot.action(/^lib:list:(\d+)$/, async (ctx) => {
    const v = await requireSessionAndAnchor<LibraryState>(ctx, 'library');
    if (v === null) return;
    await ctx.answerCbQuery();
    const { tradition, category } = v.session.state;
    await go(ctx, v, {
      screen: 'list',
      page: Number(ctx.match[1] ?? '0'),
      ...(tradition !== undefined ? { tradition } : {}),
      ...(category !== undefined ? { category } : {}),
    });
  });

  bot.action(/^lib:list:noop$/, (ctx) => ctx.answerCbQuery());

  bot.action(/^lib:herb:(.+)$/, async (ctx) => {
    const v = await requireSessionAndAnchor<LibraryState>(ctx, 'library');
    if (v === null) return;
    await ctx.answerCbQuery();
    const { tradition, category, query, page } = v.session.state;
    await go(ctx, v, {
      screen: 'card',
      herbId: ctx.match[1] ?? '',
      page,
      // Carry the origin so `« Назад` returns to the right screen (results vs list).
      ...(query !== undefined
        ? { query }
        : {
            ...(tradition !== undefined ? { tradition } : {}),
            ...(category !== undefined ? { category } : {}),
          }),
    });
  });

  bot.action(/^lib:search$/, async (ctx) => {
    const v = await requireSessionAndAnchor<LibraryState>(ctx, 'library');
    if (v === null) return;
    await ctx.answerCbQuery();
    await go(ctx, v, { screen: 'search', page: 0 });
  });

  bot.action(/^lib:results:(\d+)$/, async (ctx) => {
    const v = await requireSessionAndAnchor<LibraryState>(ctx, 'library');
    if (v === null) return;
    await ctx.answerCbQuery();
    const { query } = v.session.state;
    if (query === undefined) return;
    await go(ctx, v, { screen: 'results', query, page: Number(ctx.match[1] ?? '0') });
  });

  bot.action(/^lib:results:noop$/, (ctx) => ctx.answerCbQuery());

  // 📖 Статьи — the guides branch (Plan 006). Always registered.
  bot.action(/^lib:guides$/, async (ctx) => {
    const v = await requireSessionAndAnchor<LibraryState>(ctx, 'library');
    if (v === null) return;
    await ctx.answerCbQuery();
    await go(ctx, v, { screen: 'guide-list', page: 0 });
  });

  bot.action(/^lib:glist:(\d+)$/, async (ctx) => {
    const v = await requireSessionAndAnchor<LibraryState>(ctx, 'library');
    if (v === null) return;
    await ctx.answerCbQuery();
    await go(ctx, v, { screen: 'guide-list', page: Number(ctx.match[1] ?? '0') });
  });

  bot.action(/^lib:glist:noop$/, (ctx) => ctx.answerCbQuery());

  bot.action(/^lib:guide:(.+)$/, async (ctx) => {
    const v = await requireSessionAndAnchor<LibraryState>(ctx, 'library');
    if (v === null) return;
    await ctx.answerCbQuery();
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

  bot.action(/^lib:gsec:(\d+)$/, async (ctx) => {
    const v = await requireSessionAndAnchor<LibraryState>(ctx, 'library');
    if (v === null) return;
    await ctx.answerCbQuery();
    const { guideId, page } = v.session.state;
    if (guideId === undefined) return;
    await go(ctx, v, {
      screen: 'guide-section',
      guideId,
      section: Number(ctx.match[1] ?? '0'),
      page,
    });
  });

  bot.action(/^lib:gsec:noop$/, (ctx) => ctx.answerCbQuery());

  // 🧪 Формулы — built but registered ONLY when the doctor-gate is lifted
  // (ADR 006, `_formula-gate`). While withheld, these handlers are never wired,
  // so even a hand-crafted `lib:formula:*` callback falls through to a no-op.
  if (FORMULA_BRANCH_ENABLED) {
    bot.action(/^lib:formulas$/, async (ctx) => {
      const v = await requireSessionAndAnchor<LibraryState>(ctx, 'library');
      if (v === null) return;
      await ctx.answerCbQuery();
      await go(ctx, v, { screen: 'formula-list', page: 0 });
    });

    bot.action(/^lib:flist:(\d+)$/, async (ctx) => {
      const v = await requireSessionAndAnchor<LibraryState>(ctx, 'library');
      if (v === null) return;
      await ctx.answerCbQuery();
      await go(ctx, v, { screen: 'formula-list', page: Number(ctx.match[1] ?? '0') });
    });

    bot.action(/^lib:flist:noop$/, (ctx) => ctx.answerCbQuery());

    bot.action(/^lib:formula:(.+)$/, async (ctx) => {
      const v = await requireSessionAndAnchor<LibraryState>(ctx, 'library');
      if (v === null) return;
      await ctx.answerCbQuery();
      const formulaId = ctx.match[1] ?? '';
      if (!deps.content.combinations.byId.has(formulaId)) return;
      const { query, page } = v.session.state;
      await go(ctx, v, {
        screen: 'formula-card',
        formulaId,
        page,
        // Carry a search origin so `« Назад` returns to the results.
        ...(query !== undefined ? { query } : {}),
      });
    });
  }

  bot.action(/^lib:tips$/, async (ctx) => {
    const v = await requireSessionAndAnchor<LibraryState>(ctx, 'library');
    if (v === null) return;
    await ctx.answerCbQuery();
    await go(ctx, v, { screen: 'tips', page: 0 });
  });

  bot.action(/^lib:back$/, async (ctx) => {
    const v = await requireSessionAndAnchor<LibraryState>(ctx, 'library');
    if (v === null) return;
    await ctx.answerCbQuery();
    await go(ctx, v, backState(v.session.state));
  });

  bot.action(/^lib:home$/, async (ctx) => {
    const v = await requireSessionAndAnchor<LibraryState>(ctx, 'library');
    if (v === null) return;
    await ctx.answerCbQuery();
    await go(ctx, v, { screen: 'hub', page: 0 });
  });
}

/**
 * Free-text search-query capture. Registered **after** the menu router so a menu
 * tap (handled by `bot.hears`) wins; this consumes a plain text message only
 * while the library session is parked on the `search` prompt, editing the anchor
 * into the results, and calls `next()` otherwise so it never swallows unrelated
 * messages (mirrors the reminder-create / feedback captures).
 */
export function registerLibrarySearchTextCapture(bot: Telegraf, deps: BotDeps): void {
  bot.on('text', async (ctx, next) => {
    const userId = getUserId(ctx);
    if (userId === undefined) {
      await next();
      return;
    }
    const session = loadSession<AnchoredSession<LibraryState>>(userId, 'library');
    if (session === null || session.state.screen !== 'search') {
      await next();
      return;
    }
    const msg = ctx.message;
    const raw = msg !== undefined && 'text' in msg ? msg.text.trim() : '';
    if (raw === '') {
      await next();
      return;
    }
    const state: LibraryState = { screen: 'results', query: raw.toLowerCase(), page: 0 };
    const out = viewFor(deps, state);
    await editViewAt(ctx, session.anchor.messageId, out);
    persist(userId, session.anchor, { ...state, page: out.page });
  });
}
