/**
 * The `link` step (Plan 029 split): the 🌿 / 🧪 / ⏭ type picker and the two
 * paginated browsers (ingredient + formula) it opens. Owns the herb-attach paging
 * (`herbPageSlice`) shared by both browsers.
 */

import { Markup } from 'telegraf';

import type { Combination, Herb } from '../../../content/types';
import type { BotDeps } from '../../context';
import { assertCallbackData, pager } from '../../keyboards';
import { messages } from '../../messages';
import type { ReminderDraft } from './draft';
import { type CallbackButton, navRow, type View } from './view-kit';

/** Herbs shown per page of the optional herb-link picker. */
const HERBS_PER_PAGE = 8;

/**
 * Slice a list into a page, clamping `page` into `[0, pageCount)`. Pure and
 * order-preserving so the herb picker pages a stable corpus deterministically.
 */
export function herbPageSlice<T>(
  items: readonly T[],
  page: number,
  perPage: number = HERBS_PER_PAGE,
): { slice: readonly T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / perPage));
  const safePage = Math.min(Math.max(page, 0), pageCount - 1);
  const start = safePage * perPage;
  return { slice: items.slice(start, start + perPage), page: safePage, pageCount };
}

/** Sub-view back row for the link browsers: returns to the type picker, not prevStep. */
function linkBackRow(): CallbackButton[] {
  return [
    Markup.button.callback(messages.nav.back, 'rc:link:back'),
    Markup.button.callback(messages.reminderCreate.cancel, 'rc:cancel'),
  ];
}

/** The `link` type picker: 🌿 Ингредиент / 🧪 Состав / ⏭ Пропустить. Back → label. */
function linkChooseView(): View {
  const rc = messages.reminderCreate;
  return {
    text: rc.linkPrompt,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback(rc.linkHerb, 'rc:link:herbs')],
      [Markup.button.callback(rc.linkFormula, 'rc:link:formulas')],
      [Markup.button.callback(rc.herbSkip, 'rc:link:skip')],
      navRow(true),
    ]),
  };
}

/** The ingredient (herb) browser: a paginated list; back → the type picker. */
function herbPickerView(draft: ReminderDraft, herbs: readonly Herb[]): View {
  const rc = messages.reminderCreate;
  const { slice, page, pageCount } = herbPageSlice(herbs, draft.herbPage ?? 0);
  const rows: CallbackButton[][] = slice.map((h) => [
    Markup.button.callback(h.nameRu, assertCallbackData(`rc:herb:${h.id}`)),
  ]);
  if (pageCount > 1) rows.push(pager('rc:hpg', page, pageCount));
  rows.push(linkBackRow());
  return { text: rc.herbPrompt, keyboard: Markup.inlineKeyboard(rows) };
}

/** The formula (состав) browser: a paginated list; back → the type picker. */
export function formulaPickerView(draft: ReminderDraft, formulas: readonly Combination[]): View {
  const rc = messages.reminderCreate;
  const { slice, page, pageCount } = herbPageSlice(formulas, draft.formulaPage ?? 0);
  const rows: CallbackButton[][] = slice.map((f) => [
    Markup.button.callback(f.nameRu, assertCallbackData(`rc:formula:${f.id}`)),
  ]);
  if (pageCount > 1) rows.push(pager('rc:fpg', page, pageCount));
  rows.push(linkBackRow());
  return { text: rc.formulaPrompt, keyboard: Markup.inlineKeyboard(rows) };
}

/** Render the active `link` sub-screen (type picker, ingredient, or formula). */
export function linkView(draft: ReminderDraft, deps: BotDeps): View {
  switch (draft.linkView ?? 'choose') {
    case 'herbs':
      return herbPickerView(draft, deps.content.herbs.all);
    case 'formulas':
      return formulaPickerView(draft, deps.content.combinations.all);
    case 'choose':
    default:
      return linkChooseView();
  }
}
