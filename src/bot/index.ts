/**
 * Bot assembly. Installs middleware (in order: error boundary → request log →
 * rate limit → ensure-user) and registers every command and the payment
 * lifecycle handlers. Returns the bot plus disposers boot stops on shutdown.
 *
 * This is the Telegraf seam: domain modules never import Telegraf — only this
 * tree and `src/index.ts` do (ADR 003, enforced by ESLint).
 */

import { Telegraf } from 'telegraf';

import type { BotDeps } from './context';
import { ensureUserMiddleware } from './middleware/ensure-user';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/logger';
import { rateLimiter } from './middleware/rate-limiter';
import { registerStartCommand } from './commands/start';
import { registerHelpCommand } from './commands/help';
import { registerSettingsCommand } from './commands/settings';
import { registerBrowseCommand } from './commands/browse';
import { registerSearchCommand } from './commands/search';
import { registerHerbCommand } from './commands/herb';
import { registerTipsCommand } from './commands/tips';
import { registerRemindersCommand } from './commands/reminders';
import { registerSubscriptionsCommand } from './commands/subscriptions';
import { registerDonateCommand } from './commands/donate';
import { registerFeedbackCommand } from './commands/feedback';
import { registerMenuRouter } from './menu-router';
import { registerPaymentHandlers } from './payments';

export interface CreateBotOptions {
  token: string;
  deps: BotDeps;
}

export interface CreatedBot {
  bot: Telegraf;
  disposeRateLimiter: () => void;
}

export function createBot(options: CreateBotOptions): CreatedBot {
  const bot = new Telegraf(options.token);
  const limiter = rateLimiter();

  bot.use(errorHandler());
  bot.use(requestLogger());
  bot.use(limiter.middleware);
  bot.use(ensureUserMiddleware());

  registerStartCommand(bot);
  registerHelpCommand(bot);
  registerSettingsCommand(bot);
  registerBrowseCommand(bot, options.deps);
  registerSearchCommand(bot, options.deps);
  registerHerbCommand(bot, options.deps);
  registerTipsCommand(bot, options.deps);
  registerRemindersCommand(bot);
  registerSubscriptionsCommand(bot, options.deps);
  registerDonateCommand(bot);
  registerFeedbackCommand(bot);

  // Reply-keyboard router last: `hears` matches plain text only, so it never
  // shadows the command/action handlers registered above (ADR 009).
  registerMenuRouter(bot, options.deps);
  registerPaymentHandlers(bot);

  return { bot, disposeRateLimiter: limiter.dispose };
}
