import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setupTestDb, teardownTestDb } from '../test-helper';
import { ensureUser } from './user.repo';
import { createReminder, listDueReminders, listUserReminders, setNextFire } from './reminder.repo';

describe('reminder.repo', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  it('creates a reminder and lists it as due once its fire time passes', () => {
    const userId = ensureUser('1001', 'tester');
    const id = createReminder({
      userId,
      label: 'Принять имбирь',
      recurrence: { kind: 'daily', times: ['08:00'] },
      nextFireAt: 1_000,
    });

    expect(listDueReminders(500)).toHaveLength(0); // not yet due
    const due = listDueReminders(2_000);
    expect(due).toHaveLength(1);
    expect(due[0]?.id).toBe(id);
    expect(due[0]?.recurrence).toEqual({ kind: 'daily', times: ['08:00'] });
  });

  it('round-trips a formula-linked reminder with an intake type', () => {
    const userId = ensureUser('1003', 'tester');
    const id = createReminder({
      userId,
      label: 'Агар-8',
      combinationId: 'tib-formula-agar-8',
      intakeType: 'decoction',
      recurrence: { kind: 'daily', times: ['08:00'] },
      nextFireAt: 1_000,
    });

    const [reminder] = listUserReminders(userId);
    expect(reminder?.id).toBe(id);
    expect(reminder?.herbId).toBeNull();
    expect(reminder?.combinationId).toBe('tib-formula-agar-8');
    expect(reminder?.intakeType).toBe('decoction');
  });

  it('round-trips a herb-linked reminder with null formula + intake fields', () => {
    const userId = ensureUser('1004', 'tester');
    createReminder({
      userId,
      label: 'Имбирь',
      herbId: 'tib-ginger',
      recurrence: { kind: 'daily', times: ['09:00'] },
      nextFireAt: 1_000,
    });

    const [reminder] = listUserReminders(userId);
    expect(reminder?.herbId).toBe('tib-ginger');
    expect(reminder?.combinationId).toBeNull();
    expect(reminder?.intakeType).toBeNull();
  });

  it('deactivates a reminder when next fire is null', () => {
    const userId = ensureUser('1002', null);
    const id = createReminder({
      userId,
      label: 'once',
      recurrence: { kind: 'once' },
      nextFireAt: 1_000,
    });
    setNextFire(id, null);
    expect(listUserReminders(userId).every((r) => !r.active)).toBe(true);
    expect(listDueReminders(5_000)).toHaveLength(0);
  });
});
