/**
 * Shared inline keyboard builders. Keyboard labels stay short (~20 chars) so
 * they don't wrap on mobile. `callback_data` must stay ≤64 bytes — keep
 * payloads to short ids.
 *
 * Skeleton: a couple of representative builders. Add more as command flows land.
 */

import { Markup } from 'telegraf';

import type { Tradition } from '../content/types';
import { messages } from './messages';

/**
 * Persistent main-menu labels (ADR 009). Sourced from `messages.ts` so all
 * Russian copy stays in one place; re-exported here as the canonical handle the
 * menu router and keyboard builder share.
 */
export const MENU = messages.menu;

/**
 * Exact-match trigger for `bot.hears`. Reply-keyboard taps arrive as plain text
 * equal to the button label, so menu routing must match the whole string (not a
 * substring) to avoid colliding with a user typing the word mid-sentence.
 * Returns a one-element match array on hit so it slots into Telegraf's trigger
 * contract, `null` otherwise.
 */
export function exact(label: string): (value: string) => RegExpExecArray | null {
  return (value) => (value === label ? ([value] as unknown as RegExpExecArray) : null);
}

/**
 * The always-visible reply keyboard. `resize` keeps the buttons compact;
 * `persistent` keeps it open instead of collapsing to the keyboard icon.
 */
export function mainMenuKeyboard(): ReturnType<typeof Markup.keyboard> {
  return Markup.keyboard([[MENU.library, MENU.reminders], [MENU.tips, MENU.settings], [MENU.help]])
    .resize()
    .persistent();
}

export function traditionPicker(): ReturnType<typeof Markup.inlineKeyboard> {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🇨🇳 Китайская', 'tradition:chinese')],
    [Markup.button.callback('🏔 Тибетская', 'tradition:tibetan')],
  ]);
}

export function herbActions(herbId: string): ReturnType<typeof Markup.inlineKeyboard> {
  // Single action for the skeleton: start a reminder tied to this herb. Topic
  // subscriptions are managed per-category in /subscriptions (a distinct
  // callback namespace) to keep callback_data prefixes unambiguous.
  return Markup.inlineKeyboard([[Markup.button.callback('⏰ Напомнить', `remind:${herbId}`)]]);
}

export function tradition(value: Tradition): string {
  return value === 'chinese' ? '🇨🇳 Китайская' : '🏔 Тибетская';
}
