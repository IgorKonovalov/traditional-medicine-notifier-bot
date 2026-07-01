import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setupTestDb, teardownTestDb } from '../db/test-helper';
import { createReminder, listUserReminders } from '../db/repositories/reminder.repo';
import { ensureUser, setSetting, SETTING_TIMEZONE } from '../db/repositories/user.repo';
import { computeNextFire } from '../notifications/recurrence';
import { runReminderTick, type ReminderDispatchOptions } from './reminder-dispatch';
import type { Notifier } from './notifier';

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

/** A notifier that always delivers and records who it sent to. */
const okNotifier = (): { notifier: Notifier; sent: number[] } => {
  const sent: number[] = [];
  return {
    sent,
    notifier: {
      send: async (userId) => {
        sent.push(userId);
        return 'ok';
      },
    },
  };
};

function baseOptions(notifier: Notifier): ReminderDispatchOptions {
  return {
    cronExpression: '* * * * *',
    timezone: 'Europe/Belgrade', // bot-global default
    notifier,
    buildMessage: () => ({ body: 'ping' }),
  };
}

describe('runReminderTick — per-user timezone advance (Plan 025)', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  it("advances a due reminder in the owner's zone, not the bot-global default", async () => {
    const userId = ensureUser('1', 'u');
    setSetting(userId, SETTING_TIMEZONE, 'Asia/Almaty');
    const recurrence = { kind: 'daily', times: ['08:00'] } as const;
    createReminder({ userId, label: 'x', recurrence, nextFireAt: NOW - 1_000 });

    const { notifier, sent } = okNotifier();
    await runReminderTick(baseOptions(notifier), NOW);

    expect(sent).toEqual([userId]);
    const [r] = listUserReminders(userId);
    // Advanced to the next 08:00 *Almaty* slot, not the next 08:00 Belgrade slot.
    expect(r?.nextFireAt).toBe(computeNextFire(recurrence, NOW, 'Asia/Almaty'));
    expect(r?.nextFireAt).not.toBe(computeNextFire(recurrence, NOW, 'Europe/Belgrade'));
  });

  it('falls back to the bot-global zone when the user has no setting', async () => {
    const userId = ensureUser('2', 'u');
    const recurrence = { kind: 'daily', times: ['08:00'] } as const;
    createReminder({ userId, label: 'x', recurrence, nextFireAt: NOW - 1_000 });

    const { notifier } = okNotifier();
    await runReminderTick(baseOptions(notifier), NOW);

    const [r] = listUserReminders(userId);
    expect(r?.nextFireAt).toBe(computeNextFire(recurrence, NOW, 'Europe/Belgrade'));
  });
});
