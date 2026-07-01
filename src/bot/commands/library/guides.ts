/**
 * 📖 Статьи branch of the library (Plan 006). The guide list and the one-page
 * guide-section pager (guides are flattened into ≤-limit pages by `guidePages`).
 */

import { Markup } from 'telegraf';

import type { BotDeps } from '../../context';
import { assertCallbackData, backRow, homeRow, pager } from '../../keyboards';
import { messages } from '../../messages';
import { guideDisplayTitle, guidePages } from '../_guide-card';
import { hubView } from './hub';
import { type CallbackButton, clampPage, type LibraryState, PAGE_SIZE, type View } from './state';

export function guideListView(deps: BotDeps, page: number): View & { readonly page: number } {
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
export function guideSectionView(
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
