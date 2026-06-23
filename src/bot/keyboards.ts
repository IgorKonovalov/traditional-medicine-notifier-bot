/**
 * Shared inline keyboard builders. Keyboard labels stay short (~20 chars) so
 * they don't wrap on mobile. `callback_data` must stay ≤64 bytes — keep
 * payloads to short ids.
 *
 * Skeleton: a couple of representative builders. Add more as command flows land.
 */

import { Markup } from 'telegraf';

import type { Tradition } from '../content/types';

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
