/**
 * 💡 Случайный совет leaf of the library (Plan 021) — a random tip rendered into
 * the anchor, sharing the same per-user recent-history exclusion as `/tips` and
 * the menu so repeated visits don't immediately repeat.
 */

import { Markup } from 'telegraf';

import type { BotDeps } from '../../context';
import { backRow, homeRow } from '../../keyboards';
import { messages } from '../../messages';
import { toPlainText } from '../../render/markdown';
import { getRecent, recordShown } from '../tip-history';
import { pickRandomTip } from '../tips';
import { type View } from './state';

/**
 * The 💡 Случайный совет leaf — a random tip rendered into the anchor (Plan 021),
 * sharing the same per-user recent-history exclusion as `/tips` and the menu so
 * repeated visits don't immediately repeat. `userId` is `undefined` only when
 * ensure-user hasn't run (stateless fallback: still random, no exclusion).
 */
export function tipsView(deps: BotDeps, userId: number | undefined): View {
  const exclude = userId === undefined ? new Set<string>() : getRecent(userId);
  const tip = pickRandomTip(deps.content.tips.all, exclude);
  if (tip === null) {
    return {
      text: messages.library.tipsEmpty,
      keyboard: Markup.inlineKeyboard([backRow('lib:back'), homeRow('lib:home')]),
    };
  }
  if (userId !== undefined) recordShown(userId, tip.id);
  return {
    text: messages.tip.random(toPlainText(tip.body), tip.source),
    keyboard: Markup.inlineKeyboard([backRow('lib:back'), homeRow('lib:home')]),
  };
}
