import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setupTestDb, teardownTestDb } from '../db/test-helper';
import { createReminder, listUserReminders } from '../db/repositories/reminder.repo';
import { ensureUser } from '../db/repositories/user.repo';
import { computeNextFire } from '../notifications/recurrence';
import { recomputeUserReminderFireTimes } from './reminder-timezone';

// A fixed midday-UTC instant so the next 08:00 local slot is deterministic.
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

describe('recomputeUserReminderFireTimes', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  it('shifts an active recurring reminder to the new zone', () => {
    const userId = ensureUser('1', 'u');
    const recurrence = { kind: 'daily', times: ['08:00'] } as const;
    const seeded = computeNextFire(recurrence, NOW, 'Europe/Belgrade');
    const id = createReminder({ userId, label: 'x', recurrence, nextFireAt: seeded ?? 0 });

    const shifted = recomputeUserReminderFireTimes(userId, 'Asia/Almaty', NOW);

    expect(shifted).toBe(1);
    const [r] = listUserReminders(userId);
    expect(r?.id).toBe(id);
    expect(r?.nextFireAt).toBe(computeNextFire(recurrence, NOW, 'Asia/Almaty'));
    expect(r?.nextFireAt).not.toBe(seeded);
  });

  it('leaves a `once` reminder untouched (and does not deactivate it)', () => {
    const userId = ensureUser('2', 'u');
    const nextFireAt = NOW + 3_600_000;
    createReminder({ userId, label: 'once', recurrence: { kind: 'once' }, nextFireAt });

    const shifted = recomputeUserReminderFireTimes(userId, 'Asia/Almaty', NOW);

    expect(shifted).toBe(0);
    const [r] = listUserReminders(userId);
    expect(r?.nextFireAt).toBe(nextFireAt);
    expect(r?.active).toBe(true);
  });

  it('is a no-op when the zone yields the same fire time', () => {
    const userId = ensureUser('3', 'u');
    const recurrence = { kind: 'daily', times: ['08:00'] } as const;
    const seeded = computeNextFire(recurrence, NOW, 'Europe/Belgrade');
    createReminder({ userId, label: 'x', recurrence, nextFireAt: seeded ?? 0 });

    // Same zone → identical slot → nothing shifts.
    expect(recomputeUserReminderFireTimes(userId, 'Europe/Belgrade', NOW)).toBe(0);
  });
});
