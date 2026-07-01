/**
 * Shared view primitives for the wizard screens (Plan 029 split): the `View`
 * transport type, the `chunk` grid helper, and the trailing `« Назад` / `✖️`
 * nav row. A leaf module so the time-picker and link-browser views can import it
 * without a cycle back through the dispatcher.
 */

import { Markup } from 'telegraf';

import { messages } from '../../messages';

export type CallbackButton = ReturnType<typeof Markup.button.callback>;
export type InlineKeyboard = ReturnType<typeof Markup.inlineKeyboard>;

export interface View {
  readonly text: string;
  readonly keyboard: InlineKeyboard;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Trailing nav row: `« Назад` (when not on the first step) + `✖️ Отмена`. */
export function navRow(showBack: boolean): CallbackButton[] {
  const row: CallbackButton[] = [];
  if (showBack) row.push(Markup.button.callback(messages.nav.back, 'rc:back'));
  row.push(Markup.button.callback(messages.reminderCreate.cancel, 'rc:cancel'));
  return row;
}
