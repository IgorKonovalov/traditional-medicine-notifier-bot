/**
 * 🌿 Ингредиенты branch of the library (Plan 019 display split; code keeps the
 * "herb" vocabulary). The herbs sub-menu, category picker, herb lists (flat
 * «Все травы» and by-category), and the herb card. Pure view builders — the
 * orchestrator (`index.ts`) wires them to callbacks via `onSession`.
 */

import { Markup } from 'telegraf';

import type { Herb } from '../../../content/types';
import type { BotDeps } from '../../context';
import { assertCallbackData, backRow, homeRow, pager } from '../../keyboards';
import { messages } from '../../messages';
import { FORMULA_BRANCH_ENABLED } from '../_formula-gate';
import { herbCardKeyboard, herbFormulaLinks, renderHerb } from '../_herb-card';
import { type CallbackButton, clampPage, type LibraryState, PAGE_SIZE, type View } from './state';

// ─── content helpers ──────────────────────────────────────────────────────────

/** Categories that group at least one herb, with their herb counts. */
export function categoriesWithHerbs(
  deps: BotDeps,
): { id: string; nameRu: string; count: number }[] {
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
export function herbsFor(deps: BotDeps, state: LibraryState): readonly Herb[] {
  if (state.category !== undefined) {
    return deps.content.herbs.all.filter((h) => h.category === state.category);
  }
  return deps.content.herbs.all;
}

// ─── per-screen views ─────────────────────────────────────────────────────────

export function herbsMenuView(): View {
  return {
    text: messages.library.herbsTitle,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback(messages.library.allHerbs, 'lib:all')],
      [Markup.button.callback(messages.library.byCategory, 'lib:bycat')],
      backRow('lib:back'),
    ]),
  };
}

export function categoryPickView(deps: BotDeps, page: number): View & { readonly page: number } {
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

export function listView(deps: BotDeps, state: LibraryState): View & { readonly page: number } {
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
export function cardView(deps: BotDeps, herbId: string): View | null {
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
