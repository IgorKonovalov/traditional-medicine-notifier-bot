/**
 * Boot entry. Initialises every subsystem in dependency order, wires the
 * Notifier seam, starts the two dispatch crons and the bot polling loop, and
 * installs graceful shutdown.
 *
 *   loadConfig
 *     → initLogger
 *       → initDb (runs migrations)
 *         → loadContent (fail-fast on validation errors)
 *           → createBot (registers middleware + commands)
 *             → createTelegrafNotifier (wraps bot.telegram for the Notifier seam)
 *               → startReminderDispatch + startSubscriptionDispatch
 *                 → bot.launch()
 *
 * SIGINT/SIGTERM stops the bot, the cron tasks, the rate-limiter sweeper, and
 * the SQLite handle in reverse order.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Telegraf } from 'telegraf';

import { loadConfig, parseAdminTelegramIds } from './config';
import { loadContent } from './content/loader';
import { toPlainText } from './bot/render/markdown';
import { closeDb, initDb } from './db/connection';
import { getLogger, initLogger } from './logger';
import { runBackup } from './services/db-backup';
import { startReminderDispatch } from './services/reminder-dispatch';
import { startSubscriptionDispatch } from './services/subscription-dispatch';
import { announceNewVersion, validateAnnouncements } from './services/version-announcer';
import { getVersion } from './utils/version';
import { createBot } from './bot/index';
import { createTelegrafNotifier } from './bot/notifier';
import { deleteExpiredSessions } from './bot/session-store';
import { messages } from './bot/messages';
import type { NotificationPayload } from './services/notifier';
import type { ScheduledReminder } from './notifications/types';
import type { Tip } from './content/types';

async function main(): Promise<void> {
  const config = loadConfig();
  const log = initLogger(config.logLevel);
  log.info({ env: config.logLevel }, 'traditional-medicine-notifier-bot starting');

  const adminParse = parseAdminTelegramIds(process.env['ADMIN_TELEGRAM_IDS']);
  log.info({ count: adminParse.ids.size }, 'admin allowlist loaded');
  if (adminParse.malformed.length > 0) {
    log.warn(
      { count: adminParse.malformed.length },
      'ADMIN_TELEGRAM_IDS has non-numeric entries — ignored',
    );
  }

  initDb(config.dbPath);
  const expired = deleteExpiredSessions();
  log.info({ path: config.dbPath, expiredSessionsCleaned: expired }, 'database ready');

  const content = loadContent(config.contentDir);
  log.info(
    {
      herbs: content.herbs.all.length,
      categories: content.categories.all.length,
      tips: content.tips.all.length,
    },
    'content loaded',
  );

  // Fail fast at boot if any announcement CTA points at a missing herb or
  // yields an over-cap callback — better than a per-recipient failure mid-
  // broadcast (plan 010).
  validateAnnouncements(messages.versionAnnouncements, content);

  const { bot, disposeRateLimiter } = createBot({
    token: config.botToken,
    deps: {
      content,
      timezone: config.timezone,
      botUsername: config.botUsername,
      adminTelegramIds: config.adminTelegramIds,
    },
  });

  const notifier = createTelegrafNotifier(bot);

  // SOLICITED: user-scheduled reminders (no daily cap).
  const reminderTask = startReminderDispatch({
    cronExpression: config.reminderTickCron,
    timezone: config.timezone,
    notifier,
    buildMessage: (reminder: ScheduledReminder): NotificationPayload =>
      reminder.herbId
        ? {
            body: messages.reminder.body(reminder.label),
            cta: { kind: 'open-herb', herbId: reminder.herbId },
          }
        : { body: messages.reminder.body(reminder.label) },
  });

  // PROACTIVE: opt-in daily tip (≤1 proactive push/user/day via the budget gate).
  const tipTask = startSubscriptionDispatch({
    cronExpression: config.dailyTipCron,
    timezone: config.timezone,
    notifier,
    selectTip: () => {
      const tip = pickDailyTip(content.tips.all);
      return tip === null ? null : { body: messages.tip.daily(toPlainText(tip.body), tip.source) };
    },
  });

  // Best-effort backup at boot.
  runBackup({ backupDir: config.backupDir, timezone: config.timezone }).catch((err) =>
    log.warn({ err }, 'boot-time backup failed'),
  );

  // Periodic sweep of expired bot_sessions rows from SQLite.
  const sessionSweepHandle = setInterval(
    () => {
      const cleaned = deleteExpiredSessions();
      if (cleaned > 0) log.debug({ cleaned }, 'swept expired bot_sessions rows');
    },
    60 * 60 * 1000,
  );
  (sessionSweepHandle as { unref?: () => void }).unref?.();

  // Liveness heartbeat for the Docker HEALTHCHECK (the bot has no HTTP port).
  const heartbeatPath = join(dirname(config.dbPath), 'heartbeat');
  const writeHeartbeat = (): void => {
    try {
      writeFileSync(heartbeatPath, String(Date.now()));
    } catch (err) {
      log.warn({ err }, 'heartbeat write failed');
    }
  };
  writeHeartbeat();
  const heartbeatHandle = setInterval(writeHeartbeat, 30 * 1000);
  (heartbeatHandle as { unref?: () => void }).unref?.();

  installShutdownHandlers(async () => {
    log.info('shutting down');
    clearInterval(sessionSweepHandle);
    clearInterval(heartbeatHandle);
    safeStop(() => reminderTask.stop(), 'reminder');
    safeStop(() => tipTask.stop(), 'daily-tip');
    disposeRateLimiter();
    bot.stop('SIGTERM');
    closeDb();
  });

  await setBotCommands(bot).catch((err) =>
    log.warn({ err }, 'setMyCommands failed — bot starts anyway'),
  );

  // Post-deploy "what's new" broadcast (plan 010): one-shot per version,
  // idempotent via notified_version, Notifier-direct (bypasses the daily cap).
  await announceNewVersion({
    currentVersion: getVersion(),
    announcements: messages.versionAnnouncements,
    notifier,
    logger: log,
  });

  await bot.launch();
}

/** Rotate the tip pool by local day so subscribers don't see the same tip daily. */
function pickDailyTip(tips: readonly Tip[]): Tip | null {
  if (tips.length === 0) return null;
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  return tips[dayIndex % tips.length] ?? null;
}

function safeStop(fn: () => void, label: string): void {
  try {
    fn();
  } catch (err) {
    getLogger().warn({ err, label }, 'task stop failed');
  }
}

function installShutdownHandlers(handler: () => Promise<void>): void {
  const wrap = (signal: string): (() => void) => {
    return (): void => {
      handler()
        .catch((err) => getLogger().error({ err }, 'shutdown handler failed'))
        .finally(() => process.exit(signal === 'SIGINT' ? 130 : 0));
    };
  };
  process.once('SIGINT', wrap('SIGINT'));
  process.once('SIGTERM', wrap('SIGTERM'));
}

/** Populate Telegram's native `/` command menu with Russian descriptions. */
async function setBotCommands(bot: Telegraf): Promise<void> {
  await bot.telegram.setMyCommands([
    { command: 'browse', description: 'Травы — по традициям и категориям' },
    { command: 'search', description: 'Поиск травы по названию' },
    { command: 'tips', description: 'Совет дня' },
    { command: 'reminders', description: 'Напоминания' },
    { command: 'subscriptions', description: 'Подписки и совет дня' },
    { command: 'settings', description: 'Настройки' },
    { command: 'changelog', description: 'История обновлений' },
    { command: 'donate', description: 'Поддержать проект' },
    { command: 'feedback', description: 'Написать разработчику' },
    { command: 'help', description: 'Справка' },
  ]);
}

main().catch((err) => {
  getLogger().fatal({ err }, 'fatal during boot');
  process.exit(1);
});
