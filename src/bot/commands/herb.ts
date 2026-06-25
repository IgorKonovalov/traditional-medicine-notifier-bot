/**
 * Herb page rendering, reached from /browse, /search, or a notification CTA
 * (`herb:<id>` callback). Renders the herb's markdown body as plain text
 * (ADR 002) with a short header.
 *
 * `remind:<id>` is acknowledged but the create-reminder flow itself is a TODO
 * (see /reminders).
 */

import type { Telegraf } from 'telegraf';

import type { Herb } from '../../content/types';
import type { BotDeps } from '../context';
import { herbActions, tradition } from '../keyboards';
import { messages } from '../messages';
import { clampToTelegram, toPlainText } from '../render/markdown';

export function renderHerb(herb: Herb): string {
  const header = `${herb.nameRu}${herb.nameLatin ? ` (${herb.nameLatin})` : ''} · ${tradition(herb.tradition)}`;
  // The disclaimer is appended here at render time (ADR 006, amends ADR 002) —
  // it is no longer baked into the content body. Clamp the body first so the
  // disclaimer is never truncated away.
  const body = clampToTelegram(`${header}\n\n${toPlainText(herb.body)}`);
  return `${body}\n\n${messages.disclaimer}`;
}

export function registerHerbCommand(bot: Telegraf, deps: BotDeps): void {
  bot.action(/^herb:(.+)$/, async (ctx) => {
    const herb = deps.content.herbs.byId.get(ctx.match[1] ?? '');
    await ctx.answerCbQuery();
    if (herb === undefined) {
      await ctx.reply(messages.common.sessionExpired);
      return;
    }
    await ctx.reply(renderHerb(herb), herbActions(herb.id));
  });

  bot.action(/^remind:(.+)$/, async (ctx) => {
    // TODO: launch the create-reminder flow prefilled with this herb.
    await ctx.answerCbQuery(messages.common.notImplemented);
  });
}
