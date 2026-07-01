/**
 * /stats — admin-only operational readout (plan 032). Reports user counts,
 * reminders, proactive pushes, donations, and the running version in one
 * plaintext message (ADR 002 — no keyboard, no parse_mode).
 *
 * Deliberately hidden: not in `setBotCommands()`, `/help`, the reply keyboard,
 * or the menu router. Non-admins (and channel posts / missing `ctx.from`) get
 * **no reply at all** — the command's existence is never leaked, matching the
 * feedback-relay allowlist precedent.
 *
 * Strings are inline **English** on purpose (confirmed with owner): the readout
 * is read only by the operator, so it stays out of `messages.ts`, which is the
 * Russian *user* catalogue. Numbers use UTC day boundaries so they're stable
 * across deploy environments, independent of the per-user tz-aware daily cap.
 */

import type { Context, Telegraf } from 'telegraf';

import type { BotDeps } from '../context';
import { isAdmin } from '../context';
import { getVersion } from '../../utils/version';
import { getUserStats, type UserStats } from '../../db/repositories/user.repo';
import { getReminderStats, type ReminderStats } from '../../db/repositories/reminder.repo';
import {
  getProactiveStats,
  type ProactiveStats,
} from '../../db/repositories/notification-log.repo';
import { getDonationTotals, type DonationTotals } from '../../db/repositories/donations.repo';

export interface StatsData {
  version: string;
  users: UserStats;
  reminders: ReminderStats;
  proactive: ProactiveStats;
  donations: DonationTotals;
}

/** `YYYY-MM-DD HH:mm UTC`, or `—` for a null/empty instant. */
function formatUtc(ms: number | null): string {
  if (ms === null) return '—';
  const iso = new Date(ms).toISOString(); // e.g. 2026-06-30T21:14:07.000Z
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** Right-pad a numeric value into the fixed-width block. */
function row(label: string, value: number | string): string {
  return `  ${label.padEnd(12)}${value}`;
}

/** Inline-English fixed-width readout. Pure — unit-tested independently. */
export function formatStats(data: StatsData): string {
  const { users, reminders, proactive, donations } = data;
  return [
    `📊 Stats — v${data.version}`,
    '',
    'Users',
    row('total:', users.total),
    row('active 7d:', users.active7d),
    row('active 30d:', users.active30d),
    row('reachable:', users.activeFlag),
    '',
    'Reminders',
    row('active:', reminders.activeReminders),
    row('users:', reminders.usersWithReminders),
    '',
    'Proactive (daily-tip/digest)',
    row('today:', proactive.today),
    row('last 7d:', proactive.last7d),
    '',
    'Donations',
    row('count:', donations.count),
    row('stars:', donations.totalStars),
    row('last:', formatUtc(donations.mostRecentAt)),
  ].join('\n');
}

export async function runStatsEntry(
  ctx: Context,
  deps: BotDeps,
  now: number = Date.now(),
): Promise<void> {
  if (!isAdmin(ctx, deps.adminTelegramIds)) return;
  const data: StatsData = {
    version: getVersion(),
    users: getUserStats(now),
    reminders: getReminderStats(),
    proactive: getProactiveStats(now),
    donations: getDonationTotals(),
  };
  await ctx.reply(formatStats(data));
}

export function registerStatsCommand(bot: Telegraf, deps: BotDeps): void {
  bot.command('stats', (ctx) => runStatsEntry(ctx, deps));
}
