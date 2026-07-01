import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setupTestDb, teardownTestDb } from '../db/test-helper';
import { countSentBetween } from '../db/repositories/notification-log.repo';
import {
  ensureUser,
  getSetting,
  setSetting,
  SETTING_LAST_PROACTIVE_PUSH,
} from '../db/repositories/user.repo';
import { getLogger } from '../logger';
import { formatDate } from '../utils/datetime';
import { sendProactivePush, type BudgetContext, type ProactiveSend } from './notification-budget';
import type { Notifier, NotificationPayload, SendResult } from './notifier';

const MS_PER_DAY = 86_400_000;
// A fixed evening-UTC instant. In UTC this is 2026-01-15; in Asia/Almaty (UTC+5)
// the same instant is already 2026-01-16 — the seam the day-boundary test rides.
const NOW = Date.UTC(2026, 0, 15, 20, 0, 0);
const TZ = 'Europe/Belgrade';

/** A notifier that returns a fixed result and records every payload it saw. */
function fakeNotifier(result: SendResult): {
  notifier: Notifier;
  calls: { userId: number; payload: NotificationPayload }[];
} {
  const calls: { userId: number; payload: NotificationPayload }[] = [];
  return {
    calls,
    notifier: {
      send: async (userId, payload) => {
        calls.push({ userId, payload });
        return result;
      },
    },
  };
}

function budgetContext(notifier: Notifier, overrides: Partial<BudgetContext> = {}): BudgetContext {
  return { notifier, now: NOW, timezone: TZ, logger: getLogger(), ...overrides };
}

function dailyTip(userId: number): ProactiveSend {
  return { userId, kind: 'daily-tip', body: 'совет дня' };
}

/** Count every logged notification for a user (no time window). */
const totalLogged = (userId: number): number =>
  countSentBetween(userId, 0, Number.MAX_SAFE_INTEGER);

describe('sendProactivePush — daily cap gate (ADR 004)', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  it('delivers the first push of the calendar day and records it', async () => {
    const userId = ensureUser('1', 'u');
    const { notifier, calls } = fakeNotifier('ok');

    const outcome = await sendProactivePush(budgetContext(notifier), dailyTip(userId));

    expect(outcome).toBe('sent');
    expect(calls).toEqual([{ userId, payload: { body: 'совет дня' } }]);
    // The cap watermark is stamped with today's local date, and the send logged.
    expect(getSetting(userId, SETTING_LAST_PROACTIVE_PUSH)).toBe(formatDate(NOW, TZ));
    expect(totalLogged(userId)).toBe(1);
  });

  it('forwards an optional CTA to the notifier verbatim', async () => {
    const userId = ensureUser('1', 'u');
    const { notifier, calls } = fakeNotifier('ok');
    const cta = { kind: 'open-herb', herbId: 'tib-shilajit' } as const;

    await sendProactivePush(budgetContext(notifier), {
      userId,
      kind: 'daily-tip',
      body: 'совет дня',
      cta,
    });

    expect(calls[0]?.payload).toEqual({ body: 'совет дня', cta });
  });

  it('skips a second push on the same calendar day — no notifier call, no duplicate row', async () => {
    const userId = ensureUser('1', 'u');
    // The user already received a proactive push today.
    setSetting(userId, SETTING_LAST_PROACTIVE_PUSH, formatDate(NOW, TZ));
    const { notifier, calls } = fakeNotifier('ok');

    const outcome = await sendProactivePush(budgetContext(notifier), dailyTip(userId));

    expect(outcome).toBe('skipped-already-pushed');
    expect(calls).toEqual([]);
    expect(totalLogged(userId)).toBe(0);
  });

  it('does not let yesterday’s push block today', async () => {
    const userId = ensureUser('1', 'u');
    setSetting(userId, SETTING_LAST_PROACTIVE_PUSH, formatDate(NOW - MS_PER_DAY, TZ));
    const { notifier, calls } = fakeNotifier('ok');

    const outcome = await sendProactivePush(budgetContext(notifier), dailyTip(userId));

    expect(outcome).toBe('sent');
    expect(calls).toHaveLength(1);
    expect(getSetting(userId, SETTING_LAST_PROACTIVE_PUSH)).toBe(formatDate(NOW, TZ));
  });

  it('computes the day boundary in the configured timezone, not UTC', async () => {
    const userId = ensureUser('1', 'u');
    // Stamp the watermark with the UTC calendar day of NOW (2026-01-15).
    const utcDay = formatDate(NOW, 'UTC');
    setSetting(userId, SETTING_LAST_PROACTIVE_PUSH, utcDay);

    // In Asia/Almaty (UTC+5) the same instant is already the *next* calendar day,
    // so the UTC-dated watermark is "yesterday" there → the push goes through.
    const almaty = formatDate(NOW, 'Asia/Almaty');
    expect(almaty).not.toBe(utcDay);
    const { notifier } = fakeNotifier('ok');
    expect(
      await sendProactivePush(
        budgetContext(notifier, { timezone: 'Asia/Almaty' }),
        dailyTip(userId),
      ),
    ).toBe('sent');

    // Same instant, same watermark, but in UTC the watermark *is* today → skipped.
    teardownTestDb();
    setupTestDb();
    const userId2 = ensureUser('1', 'u');
    setSetting(userId2, SETTING_LAST_PROACTIVE_PUSH, utcDay);
    const { notifier: notifier2, calls } = fakeNotifier('ok');
    expect(
      await sendProactivePush(budgetContext(notifier2, { timezone: 'UTC' }), dailyTip(userId2)),
    ).toBe('skipped-already-pushed');
    expect(calls).toEqual([]);
  });

  it('reports a transient failure without stamping the cap (a later retry can send)', async () => {
    const userId = ensureUser('1', 'u');
    const { notifier } = fakeNotifier('transient-failure');

    const outcome = await sendProactivePush(budgetContext(notifier), dailyTip(userId));

    expect(outcome).toBe('failed-transient');
    // Neither the watermark nor the log advanced, so the day stays retryable.
    expect(getSetting(userId, SETTING_LAST_PROACTIVE_PUSH)).toBeNull();
    expect(totalLogged(userId)).toBe(0);
  });

  it('reports a permanent failure without stamping the cap or logging', async () => {
    const userId = ensureUser('1', 'u');
    const { notifier } = fakeNotifier('permanent-failure');

    const outcome = await sendProactivePush(budgetContext(notifier), dailyTip(userId));

    expect(outcome).toBe('failed-permanent');
    expect(getSetting(userId, SETTING_LAST_PROACTIVE_PUSH)).toBeNull();
    expect(totalLogged(userId)).toBe(0);
  });
});
