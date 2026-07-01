/**
 * /stats tests (plan 032). Covers the pure `formatStats` renderer and the
 * admin gate on `runStatsEntry`: an allowlisted id gets the readout with the
 * seeded numbers; a non-admin, a missing `ctx.from`, and an empty allowlist all
 * get **no reply at all** (the command's existence is never leaked).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Context } from 'telegraf';

import { setupTestDb, teardownTestDb } from '../../db/test-helper';
import type { BotDeps } from '../context';
import { ensureUser } from '../../db/repositories/user.repo';
import { createReminder } from '../../db/repositories/reminder.repo';
import { logNotification } from '../../db/repositories/notification-log.repo';
import { recordDonation } from '../../db/repositories/donations.repo';
import { formatStats, runStatsEntry, type StatsData } from './stats';

function makeCtx(fromId: number | undefined): { ctx: Context; replies: string[] } {
  const replies: string[] = [];
  const ctx = {
    from: fromId === undefined ? undefined : { id: fromId },
    reply: (text: string): Promise<unknown> => {
      replies.push(text);
      return Promise.resolve({ message_id: 1 });
    },
  } as unknown as Context;
  return { ctx, replies };
}

function deps(adminIds: string[]): BotDeps {
  return {
    content: {} as BotDeps['content'],
    timezone: 'UTC',
    botUsername: 'test_bot',
    adminTelegramIds: new Set(adminIds),
  };
}

describe('formatStats', () => {
  const sample: StatsData = {
    version: '9.9.9',
    users: { total: 42, active7d: 10, active30d: 25, activeFlag: 40 },
    reminders: { activeReminders: 8, usersWithReminders: 5 },
    proactive: { today: 3, last7d: 18 },
    donations: { count: 6, totalStars: 420, mostRecentAt: 1_719_782_047_000 },
  };

  it('carries the version in the header', () => {
    expect(formatStats(sample)).toContain('v9.9.9');
  });

  it('renders every aggregate number', () => {
    const out = formatStats(sample);
    for (const n of ['42', '10', '25', '40', '8', '5', '3', '18', '6', '420']) {
      expect(out).toContain(n);
    }
  });

  it('formats the most-recent donation as a UTC timestamp', () => {
    expect(formatStats(sample)).toContain('UTC');
  });

  it('renders a null most-recent timestamp as an em dash', () => {
    const out = formatStats({
      ...sample,
      donations: { count: 0, totalStars: 0, mostRecentAt: null },
    });
    expect(out).toContain('last:');
    expect(out).toContain('—');
  });
});

describe('runStatsEntry admin gate', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  function seed(): void {
    const admin = ensureUser('777', 'admin');
    createReminder({
      userId: admin,
      label: 'x',
      recurrence: { kind: 'daily', times: ['08:00'] },
      nextFireAt: 1_000,
    });
    logNotification(admin, 'daily-tip', Date.now());
    recordDonation({ userId: admin, starsAmount: 50, telegramChargeId: 'c1' });
  }

  it('replies to an allowlisted admin with the seeded numbers', async () => {
    seed();
    const { ctx, replies } = makeCtx(777);
    await runStatsEntry(ctx, deps(['777']));
    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain('📊 Stats');
    expect(replies[0]).toContain('active:'); // reminders section present
  });

  it('does not reply to a non-admin id', async () => {
    seed();
    const { ctx, replies } = makeCtx(123);
    await runStatsEntry(ctx, deps(['777']));
    expect(replies).toHaveLength(0);
  });

  it('does not reply when ctx.from is missing (channel post)', async () => {
    seed();
    const { ctx, replies } = makeCtx(undefined);
    await runStatsEntry(ctx, deps(['777']));
    expect(replies).toHaveLength(0);
  });

  it('does not reply when the allowlist is empty', async () => {
    seed();
    const { ctx, replies } = makeCtx(777);
    await runStatsEntry(ctx, deps([]));
    expect(replies).toHaveLength(0);
  });
});
