/**
 * 🧪 Составы branch of the library (live post sign-off — `_formula-gate`; UI
 * label «Составы» while code/ids keep the "formula/combination" vocabulary). The
 * formula list, the formula-only 🔎 search prompt + results, and the formula
 * card. The orchestrator registers these handlers only when the gate is lifted.
 */

import { Markup } from 'telegraf';

import type { BotDeps } from '../../context';
import { assertCallbackData, backRow, homeRow, pager } from '../../keyboards';
import { messages } from '../../messages';
import { formulaCardKeyboard, formulaMemberLinks, renderFormula } from '../_formula-card';
import { formulaMatches } from './search';
import { type CallbackButton, clampPage, type LibraryState, PAGE_SIZE, type View } from './state';

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
export function formulaSearchPromptView(): View {
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
export function formulaCardView(deps: BotDeps, formulaId: string): View | null {
  const formula = deps.content.combinations.byId.get(formulaId);
  if (formula === undefined) return null;
  const links = formulaMemberLinks(formula, deps.content);
  return {
    text: renderFormula(formula),
    keyboard: formulaCardKeyboard(links, [backRow('lib:back'), homeRow('lib:home')]),
    html: true,
  };
}
