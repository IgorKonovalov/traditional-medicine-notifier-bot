/**
 * 🔎 Поиск branch of the library — the unified top-level search: the prompt, the
 * matcher predicates, `searchHits` (herbs always; formulas only once the
 * doctor-gate is lifted), and the results list. The formula-only search lives in
 * `formulas.ts`.
 */

import { Markup } from 'telegraf';

import type { Combination, Herb } from '../../../content/types';
import type { BotDeps } from '../../context';
import { assertCallbackData, backRow, homeRow, pager } from '../../keyboards';
import { messages } from '../../messages';
import { FORMULA_BRANCH_ENABLED } from '../_formula-gate';
import { type CallbackButton, clampPage, type LibraryState, PAGE_SIZE, type View } from './state';

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
export function searchPromptView(): View {
  return {
    text: messages.search.prompt,
    keyboard: Markup.inlineKeyboard([backRow('lib:back'), homeRow('lib:home')]),
  };
}

export function resultsView(deps: BotDeps, state: LibraryState): View & { readonly page: number } {
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
