/**
 * Shared herb-card rendering, reused by the browse and search drilldown flows
 * and the notification "Открыть" CTA. Keeping it in one place means every entry
 * point renders an identical card with the render-time disclaimer (ADR 006).
 */

import { Markup } from 'telegraf';

import type { Herb } from '../../content/types';
import { tradition } from '../keyboards';
import { messages } from '../messages';
import { clampToTelegram, toPlainText } from '../render/markdown';

type CallbackButton = ReturnType<typeof Markup.button.callback>;

export function renderHerb(herb: Herb): string {
  const header = `${herb.nameRu}${herb.nameLatin ? ` (${herb.nameLatin})` : ''} · ${tradition(herb.tradition)}`;
  // The disclaimer is appended here at render time (ADR 006, amends ADR 002) —
  // it is no longer baked into the content body. Clamp the body first so the
  // disclaimer is never truncated away.
  const body = clampToTelegram(`${header}\n\n${toPlainText(herb.body)}`);
  return `${body}\n\n${messages.disclaimer}`;
}

/**
 * Keyboard for an anchored herb card: the `⏰ Напомнить` CTA (still a stub —
 * Plan 008 wires the create flow) above whatever navigation rows the calling
 * flow supplies (its own back/home).
 */
export function herbCardKeyboard(
  herbId: string,
  navRows: CallbackButton[][],
): ReturnType<typeof Markup.inlineKeyboard> {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⏰ Напомнить', `remind:${herbId}`)],
    ...navRows,
  ]);
}
