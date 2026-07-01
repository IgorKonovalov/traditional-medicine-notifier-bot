/**
 * The 📚 Библиотека root screen. Kept in its own low-level module so branch
 * card views can fall back to it (`{ ...hubView(), page: 0 }`) without importing
 * the orchestrator — avoiding an index ↔ branch cycle.
 */

import { Markup } from 'telegraf';

import { messages } from '../../messages';
import { FORMULA_BRANCH_ENABLED } from '../_formula-gate';
import { type CallbackButton, type View } from './state';

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
