/**
 * Reply-keyboard router (ADR 009). Each persistent-menu button arrives as plain
 * text equal to its label; `bot.hears(exact(LABEL), …)` dispatches it to the
 * same entry function the matching slash command uses, so the menu and `/`
 * commands never drift.
 *
 * Every tap first disposes any open drilldown session (defense in depth): a user
 * who jumps to another section mid-flow must not strand an anchor bound to a
 * stale `message_id`.
 *
 * Registered after the command handlers in `index.ts` — `hears` matches only
 * plain text, so it never shadows the `bot.command`/`bot.action` handlers.
 */

import type { Context, Telegraf } from 'telegraf';

import { browseEntry } from './commands/browse';
import { helpEntry } from './commands/help';
import { remindersEntry } from './commands/reminders';
import { settingsEntry } from './commands/settings';
import { tipsEntry } from './commands/tips';
import type { BotDeps } from './context';
import { getUserId } from './context';
import { exact, MENU } from './keyboards';
import { disposeAllSessions } from './session-store';

function disposeSessions(ctx: Context): void {
  const userId = getUserId(ctx);
  if (userId !== undefined) disposeAllSessions(userId);
}

export function registerMenuRouter(bot: Telegraf, deps: BotDeps): void {
  bot.hears(exact(MENU.library), async (ctx) => {
    disposeSessions(ctx);
    await browseEntry(ctx);
  });

  bot.hears(exact(MENU.reminders), async (ctx) => {
    disposeSessions(ctx);
    await remindersEntry(ctx);
  });

  bot.hears(exact(MENU.tips), async (ctx) => {
    disposeSessions(ctx);
    await tipsEntry(ctx, deps);
  });

  bot.hears(exact(MENU.settings), async (ctx) => {
    disposeSessions(ctx);
    await settingsEntry(ctx, deps);
  });

  bot.hears(exact(MENU.help), async (ctx) => {
    disposeSessions(ctx);
    await helpEntry(ctx);
  });
}
