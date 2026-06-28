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

import type { Herb, Tradition } from '../../content/types';
import type { BotDeps } from '../context';
import { getUserId } from '../context';
import { assertCallbackData, backRow, homeRow, pager } from '../keyboards';
import { messages } from '../messages';
import { type Anchor, editAnchor, sendAnchor } from '../render/anchor';
import { toPlainText } from '../render/markdown';
import { type AnchoredSession, deleteSession, saveSession, SESSION_TTL_MS } from '../session-store';
import { requireSessionAndAnchor, type ValidatedCallback } from './_callback-prologue';
import { FORMULA_BRANCH_ENABLED } from './_formula-gate';
import { herbCardKeyboard, herbFormulaLinks, renderHerb } from './_herb-card';
import { pickDailyTip } from './tips';

const PAGE_SIZE = 8;

/** Which screen of the library drilldown is showing. */
type Screen = 'hub' | 'herbs' | 'pick-tradition' | 'pick-category' | 'list' | 'card' | 'tips';

/**
 * Library drilldown state. `tradition` xor `category` records how the current
 * herb list was reached (so `« Назад` from a card returns to the right list and
 * the list returns to the right picker); `page` is the active list/picker page;
 * `herbId` is set while a card is open.
 */
interface LibraryState {
  readonly screen: Screen;
  readonly tradition?: Tradition;
  readonly category?: string;
  readonly page: number;
  readonly herbId?: string;
}

interface View {
  readonly text: string;
  readonly keyboard: ReturnType<typeof Markup.inlineKeyboard>;
}

type CallbackButton = ReturnType<typeof Markup.button.callback>;

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

/** The library root. Branches whose owning plan hasn't shipped stay hidden;
 *  `🧪 Формулы` appears only once the doctor-gate is lifted (`_formula-gate`). */
function hubView(): View {
  const rows: CallbackButton[][] = [
    [Markup.button.callback(messages.library.herbs, 'lib:herbs')],
    [Markup.button.callback(messages.library.tips, 'lib:tips')],
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

/** Render whichever screen `state` names, clamping page where it paginates. */
function viewFor(deps: BotDeps, state: LibraryState): View & { readonly page: number } {
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
      // Back to the originating list, or the hub for a context-free card
      // (the notification "Открыть" deep link).
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
    case 'herbs':
    case 'tips':
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
  const anchor = await sendAnchor(ctx, view.text, view.keyboard);
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
  const anchor = await sendAnchor(ctx, view.text, view.keyboard);
  persist(userId, anchor, { screen: 'herbs', page: 0 });
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
  const anchor = await sendAnchor(ctx, view.text, view.keyboard);
  persist(userId, anchor, { screen: 'card', page: 0, herbId });
}

// ─── registration ─────────────────────────────────────────────────────────────

export function registerLibraryCommand(bot: Telegraf, deps: BotDeps): void {
  /** Edit the anchor to `next`, clamping its page, and persist. */
  const go = async (
    ctx: Context,
    v: ValidatedCallback<LibraryState>,
    next: LibraryState,
  ): Promise<void> => {
    const out = viewFor(deps, next);
    await editAnchor(ctx, out.text, out.keyboard);
    persist(v.userId, v.session.anchor, { ...next, page: out.page });
  };

  bot.command('library', libraryEntry);
  bot.command('browse', libraryHerbsEntry);

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
    const { tradition, category, page } = v.session.state;
    await go(ctx, v, {
      screen: 'card',
      herbId: ctx.match[1] ?? '',
      page,
      ...(tradition !== undefined ? { tradition } : {}),
      ...(category !== undefined ? { category } : {}),
    });
  });

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
