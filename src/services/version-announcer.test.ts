import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setupTestDb, teardownTestDb } from '../db/test-helper';
import {
  ensureUser,
  getUserById,
  markNotified,
  setSetting,
  SETTING_FEATURE_ANNOUNCEMENTS,
} from '../db/repositories/user.repo';
import {
  announceNewVersion,
  classifyDelta,
  validateAnnouncements,
  type AnnouncementValidatorContent,
} from './version-announcer';
import type { NotificationPayload, Notifier, SendResult, UserId } from './notifier';

interface LogCall {
  obj: Record<string, unknown>;
  msg: string;
}

interface FakeLogger {
  info: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  infoCalls: LogCall[];
  warnCalls: LogCall[];
}

function makeFakeLogger(): FakeLogger {
  const infoCalls: LogCall[] = [];
  const warnCalls: LogCall[] = [];
  const push = (list: LogCall[]) => (obj: unknown, msg?: string) =>
    list.push({ obj: (obj ?? {}) as Record<string, unknown>, msg: msg ?? '' });
  return {
    infoCalls,
    warnCalls,
    info: push(infoCalls),
    warn: push(warnCalls),
    debug: () => {},
    error: () => {},
  };
}

/** Cast path — we only need the shape the announcer uses. */
function asLogger(fake: FakeLogger): Parameters<typeof announceNewVersion>[0]['logger'] {
  return fake as unknown as Parameters<typeof announceNewVersion>[0]['logger'];
}

class FakeNotifier implements Notifier {
  public sent: { userId: UserId; payload: NotificationPayload }[] = [];
  /** Per-user SendResult to return on next call (consumed on read). */
  public resultFor: Map<UserId, SendResult> = new Map();

  async send(userId: UserId, payload: NotificationPayload): Promise<SendResult> {
    const override = this.resultFor.get(userId);
    if (override !== undefined) {
      this.resultFor.delete(userId);
      if (override !== 'ok') return override;
    }
    this.sent.push({ userId, payload });
    return 'ok';
  }
}

/**
 * Creates an active user with a chosen `notified_version` watermark and opt-in
 * state. `'on'` writes `'1'`, `'off'` writes `'0'`, `'absent'` leaves no
 * setting row (the default-disabled state). A null `notifiedVersion` leaves the
 * column NULL (a fresh post-migration user).
 */
function makeUser(
  externalId: string,
  notifiedVersion: string | null,
  optIn: 'on' | 'off' | 'absent' = 'on',
): number {
  const id = ensureUser(externalId, externalId, Number(externalId));
  if (notifiedVersion !== null) markNotified(id, notifiedVersion);
  if (optIn === 'on') setSetting(id, SETTING_FEATURE_ANNOUNCEMENTS, '1');
  else if (optIn === 'off') setSetting(id, SETTING_FEATURE_ANNOUNCEMENTS, '0');
  // 'absent' → no row at all (default-disabled).
  return id;
}

describe('classifyDelta', () => {
  it('null notified → ping (first-time user past migration)', () => {
    expect(classifyDelta(null, '0.2.0')).toBe('ping');
  });

  it('major bump → ping', () => {
    expect(classifyDelta('0.9.9', '1.0.0')).toBe('ping');
  });

  it('minor bump → ping', () => {
    expect(classifyDelta('0.1.5', '0.2.0')).toBe('ping');
  });

  it('patch bump → skip', () => {
    expect(classifyDelta('0.2.0', '0.2.1')).toBe('skip');
  });

  it('equal versions → skip', () => {
    expect(classifyDelta('0.2.0', '0.2.0')).toBe('skip');
  });

  it('downgrade → skip (graceful)', () => {
    expect(classifyDelta('0.3.0', '0.2.0')).toBe('skip');
  });

  it('unparseable notified → ping', () => {
    expect(classifyDelta('garbage', '0.2.0')).toBe('ping');
  });
});

describe('announceNewVersion', () => {
  beforeEach(() => {
    setupTestDb();
  });
  afterEach(() => {
    teardownTestDb();
  });

  it('sends one message per minor-behind user and marks them notified', async () => {
    const a = makeUser('1', '0.1.0');
    const b = makeUser('2', null);
    const notifier = new FakeNotifier();
    const logger = makeFakeLogger();

    await announceNewVersion({
      currentVersion: '0.2.0',
      announcements: { '0.2.0': 'Новая версия!' },
      notifier,
      logger: asLogger(logger),
      sleep: async () => {},
      rateLimitMs: 0,
    });

    expect(notifier.sent.map((s) => s.userId).sort()).toEqual([a, b].sort());
    expect(notifier.sent[0]?.payload.body).toBe('Новая версия!');
    expect(getUserById(a)?.notified_version).toBe('0.2.0');
    expect(getUserById(b)?.notified_version).toBe('0.2.0');
  });

  it('patch-only delta → silent, but marks users current', async () => {
    const a = makeUser('1', '0.2.0');
    const notifier = new FakeNotifier();
    const logger = makeFakeLogger();

    await announceNewVersion({
      currentVersion: '0.2.1',
      announcements: { '0.2.1': 'Should not be used' },
      notifier,
      logger: asLogger(logger),
      sleep: async () => {},
      rateLimitMs: 0,
    });

    expect(notifier.sent).toHaveLength(0);
    expect(getUserById(a)?.notified_version).toBe('0.2.1');
  });

  it('skips already-current users entirely', async () => {
    makeUser('1', '0.2.0');
    const notifier = new FakeNotifier();
    const logger = makeFakeLogger();

    await announceNewVersion({
      currentVersion: '0.2.0',
      announcements: { '0.2.0': 'Новая версия!' },
      notifier,
      logger: asLogger(logger),
      sleep: async () => {},
      rateLimitMs: 0,
    });

    expect(notifier.sent).toHaveLength(0);
  });

  it('transient failure leaves notified_version stale for next-boot retry', async () => {
    const a = makeUser('1', '0.1.0');
    const notifier = new FakeNotifier();
    notifier.resultFor.set(a, 'transient-failure');
    const logger = makeFakeLogger();

    await announceNewVersion({
      currentVersion: '0.2.0',
      announcements: { '0.2.0': 'Новая версия!' },
      notifier,
      logger: asLogger(logger),
      sleep: async () => {},
      rateLimitMs: 0,
    });

    expect(notifier.sent).toHaveLength(0);
    expect(getUserById(a)?.notified_version).toBe('0.1.0');
    expect(logger.warnCalls.length).toBeGreaterThan(0);
  });

  it('permanent failure still marks notified to prevent dead-loop', async () => {
    const a = makeUser('1', '0.1.0');
    const notifier = new FakeNotifier();
    notifier.resultFor.set(a, 'permanent-failure');
    const logger = makeFakeLogger();

    await announceNewVersion({
      currentVersion: '0.2.0',
      announcements: { '0.2.0': 'Новая версия!' },
      notifier,
      logger: asLogger(logger),
      sleep: async () => {},
      rateLimitMs: 0,
    });

    expect(notifier.sent).toHaveLength(0);
    expect(getUserById(a)?.notified_version).toBe('0.2.0');
  });

  it('minor/major bump with no announcement string marks everyone and warns', async () => {
    const a = makeUser('1', '0.1.0');
    const notifier = new FakeNotifier();
    const logger = makeFakeLogger();

    await announceNewVersion({
      currentVersion: '0.2.0',
      announcements: {}, // no entry for 0.2.0
      notifier,
      logger: asLogger(logger),
      sleep: async () => {},
      rateLimitMs: 0,
    });

    expect(notifier.sent).toHaveLength(0);
    expect(getUserById(a)?.notified_version).toBe('0.2.0');
    expect(logger.warnCalls.length).toBeGreaterThan(0);
  });

  it('no candidates → no-op', async () => {
    const notifier = new FakeNotifier();
    const logger = makeFakeLogger();

    await announceNewVersion({
      currentVersion: '0.2.0',
      announcements: { '0.2.0': 'Новая версия!' },
      notifier,
      logger: asLogger(logger),
      sleep: async () => {},
      rateLimitMs: 0,
    });

    expect(notifier.sent).toHaveLength(0);
  });

  it('passes through CTA when the entry is an AnnouncementMessage object', async () => {
    const a = makeUser('1', '0.1.0');
    const notifier = new FakeNotifier();
    const logger = makeFakeLogger();

    await announceNewVersion({
      currentVersion: '0.2.0',
      announcements: {
        '0.2.0': {
          body: 'Новая версия!',
          cta: { kind: 'open-herb', herbId: 'herb-x' },
        },
      },
      notifier,
      logger: asLogger(logger),
      sleep: async () => {},
      rateLimitMs: 0,
    });

    expect(notifier.sent).toHaveLength(1);
    expect(notifier.sent[0]?.userId).toBe(a);
    expect(notifier.sent[0]?.payload).toEqual({
      body: 'Новая версия!',
      cta: { kind: 'open-herb', herbId: 'herb-x' },
    });
  });

  it('object entry without CTA produces a body-only payload (no cta key)', async () => {
    makeUser('1', '0.1.0');
    const notifier = new FakeNotifier();
    const logger = makeFakeLogger();

    await announceNewVersion({
      currentVersion: '0.2.0',
      announcements: { '0.2.0': { body: 'Только тело' } },
      notifier,
      logger: asLogger(logger),
      sleep: async () => {},
      rateLimitMs: 0,
    });

    expect(notifier.sent).toHaveLength(1);
    expect(notifier.sent[0]?.payload).toEqual({ body: 'Только тело' });
  });

  it('rate-limits between sends', async () => {
    makeUser('1', '0.1.0');
    makeUser('2', '0.1.0');
    const notifier = new FakeNotifier();
    const logger = makeFakeLogger();
    const sleepCalls: number[] = [];

    await announceNewVersion({
      currentVersion: '0.2.0',
      announcements: { '0.2.0': 'Новая версия!' },
      notifier,
      logger: asLogger(logger),
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
      rateLimitMs: 100,
    });

    expect(notifier.sent).toHaveLength(2);
    expect(sleepCalls).toEqual([100, 100]);
  });

  // ─── opt-in gate + priority bypass ─────────────────────────────────────────

  it('opted-out user with non-priority queue: no send, but notified_version advances', async () => {
    const id = makeUser('1', '0.1.0', 'off');
    const notifier = new FakeNotifier();
    const logger = makeFakeLogger();

    await announceNewVersion({
      currentVersion: '0.2.0',
      announcements: { '0.2.0': 'Новая версия!' },
      notifier,
      logger: asLogger(logger),
      sleep: async () => {},
      rateLimitMs: 0,
    });

    // Opted-out users are visible to the broadcast loop (LEFT JOIN, not INNER
    // JOIN). They get filtered locally — non-priority entries are dropped —
    // and marked to current so they don't show up perpetually.
    expect(notifier.sent).toHaveLength(0);
    expect(getUserById(id)?.notified_version).toBe('0.2.0');
  });

  it('default-state user (no setting row) gets non-priority entries skipped, notified_version advances', async () => {
    const id = makeUser('1', '0.1.0', 'absent');
    const notifier = new FakeNotifier();
    const logger = makeFakeLogger();

    await announceNewVersion({
      currentVersion: '0.2.0',
      announcements: { '0.2.0': 'Новая версия!' },
      notifier,
      logger: asLogger(logger),
      sleep: async () => {},
      rateLimitMs: 0,
    });

    expect(notifier.sent).toHaveLength(0);
    expect(getUserById(id)?.notified_version).toBe('0.2.0');
  });

  it('only opted-in users receive non-priority entries when a mix of states is present', async () => {
    const optedIn = makeUser('1', '0.1.0', 'on');
    makeUser('2', '0.1.0', 'off');
    makeUser('3', '0.1.0', 'absent');
    const notifier = new FakeNotifier();
    const logger = makeFakeLogger();

    await announceNewVersion({
      currentVersion: '0.2.0',
      announcements: { '0.2.0': 'Новая версия!' },
      notifier,
      logger: asLogger(logger),
      sleep: async () => {},
      rateLimitMs: 0,
    });

    expect(notifier.sent.map((s) => s.userId)).toEqual([optedIn]);
    expect(getUserById(optedIn)?.notified_version).toBe('0.2.0');
  });

  // ─── multi-version queue + cap + priority bypass ───────────────────────────

  it('user behind 3 minors receives all 3 messages in ascending order with intra-user delay', async () => {
    const id = makeUser('1', '0.1.0', 'on');
    const notifier = new FakeNotifier();
    const logger = makeFakeLogger();
    const sleepCalls: number[] = [];

    await announceNewVersion({
      currentVersion: '0.4.0',
      announcements: {
        '0.2.0': 'release 0.2.0',
        '0.3.0': 'release 0.3.0',
        '0.4.0': 'release 0.4.0',
      },
      notifier,
      logger: asLogger(logger),
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
      rateLimitMs: 100,
    });

    expect(notifier.sent.map((s) => s.payload.body)).toEqual([
      'release 0.2.0',
      'release 0.3.0',
      'release 0.4.0',
    ]);
    // Two intra-user gaps (1500 ms) + one trailing inter-user gap (100 ms).
    expect(sleepCalls).toEqual([1500, 1500, 100]);
    expect(getUserById(id)?.notified_version).toBe('0.4.0');
  });

  it('user behind 5 minors receives only the 3 most recent', async () => {
    const id = makeUser('1', '0.1.0', 'on');
    const notifier = new FakeNotifier();
    const logger = makeFakeLogger();

    await announceNewVersion({
      currentVersion: '0.6.0',
      announcements: {
        '0.2.0': 'release 0.2.0',
        '0.3.0': 'release 0.3.0',
        '0.4.0': 'release 0.4.0',
        '0.5.0': 'release 0.5.0',
        '0.6.0': 'release 0.6.0',
      },
      notifier,
      logger: asLogger(logger),
      sleep: async () => {},
      rateLimitMs: 0,
    });

    expect(notifier.sent.map((s) => s.payload.body)).toEqual([
      'release 0.4.0',
      'release 0.5.0',
      'release 0.6.0',
    ]);
    expect(getUserById(id)?.notified_version).toBe('0.6.0');
  });

  it('opted-out user receives only priority entries from the queue', async () => {
    const id = makeUser('1', '0.1.0', 'off');
    const notifier = new FakeNotifier();
    const logger = makeFakeLogger();

    await announceNewVersion({
      currentVersion: '0.4.0',
      announcements: {
        '0.2.0': 'non-priority 0.2.0',
        '0.3.0': { body: 'priority 0.3.0', priority: true },
        '0.4.0': 'non-priority 0.4.0',
      },
      notifier,
      logger: asLogger(logger),
      sleep: async () => {},
      rateLimitMs: 0,
    });

    expect(notifier.sent.map((s) => s.payload.body)).toEqual(['priority 0.3.0']);
    expect(getUserById(id)?.notified_version).toBe('0.4.0');
  });

  it('opted-in user receives priority and non-priority entries together (capped)', async () => {
    const id = makeUser('1', '0.1.0', 'on');
    const notifier = new FakeNotifier();
    const logger = makeFakeLogger();

    await announceNewVersion({
      currentVersion: '0.4.0',
      announcements: {
        '0.2.0': 'non-priority 0.2.0',
        '0.3.0': { body: 'priority 0.3.0', priority: true },
        '0.4.0': 'non-priority 0.4.0',
      },
      notifier,
      logger: asLogger(logger),
      sleep: async () => {},
      rateLimitMs: 0,
    });

    expect(notifier.sent.map((s) => s.payload.body)).toEqual([
      'non-priority 0.2.0',
      'priority 0.3.0',
      'non-priority 0.4.0',
    ]);
    expect(getUserById(id)?.notified_version).toBe('0.4.0');
  });

  it('transient failure mid-batch leaves notified_version at last successful, drains rest on next call', async () => {
    const id = makeUser('1', '0.1.0', 'on');
    const notifier = new FakeNotifier();
    const logger = makeFakeLogger();

    // First broadcast: succeed for 0.2.0, fail transiently for 0.3.0.
    let call = 0;
    notifier.send = async (userId, payload) => {
      call++;
      notifier.sent.push({ userId, payload });
      if (call === 2) {
        notifier.sent.pop(); // don't record the failed send
        return 'transient-failure';
      }
      return 'ok';
    };

    await announceNewVersion({
      currentVersion: '0.4.0',
      announcements: {
        '0.2.0': 'release 0.2.0',
        '0.3.0': 'release 0.3.0',
        '0.4.0': 'release 0.4.0',
      },
      notifier,
      logger: asLogger(logger),
      sleep: async () => {},
      rateLimitMs: 0,
    });

    // 0.2.0 was delivered, 0.3.0 failed transiently, 0.4.0 was never tried.
    expect(notifier.sent.map((s) => s.payload.body)).toEqual(['release 0.2.0']);
    expect(getUserById(id)?.notified_version).toBe('0.2.0');
    expect(logger.warnCalls.length).toBeGreaterThan(0);

    // Next boot picks the user back up with a queue of [0.3.0, 0.4.0].
    const notifier2 = new FakeNotifier();
    await announceNewVersion({
      currentVersion: '0.4.0',
      announcements: {
        '0.2.0': 'release 0.2.0',
        '0.3.0': 'release 0.3.0',
        '0.4.0': 'release 0.4.0',
      },
      notifier: notifier2,
      logger: asLogger(logger),
      sleep: async () => {},
      rateLimitMs: 0,
    });

    expect(notifier2.sent.map((s) => s.payload.body)).toEqual(['release 0.3.0', 'release 0.4.0']);
    expect(getUserById(id)?.notified_version).toBe('0.4.0');
  });

  it('permanent failure mid-batch marks notified to current and stops the queue', async () => {
    const id = makeUser('1', '0.1.0', 'on');
    const notifier = new FakeNotifier();
    const logger = makeFakeLogger();

    let call = 0;
    notifier.send = async (userId, payload) => {
      call++;
      if (call === 2) {
        return 'permanent-failure';
      }
      notifier.sent.push({ userId, payload });
      return 'ok';
    };

    await announceNewVersion({
      currentVersion: '0.4.0',
      announcements: {
        '0.2.0': 'release 0.2.0',
        '0.3.0': 'release 0.3.0',
        '0.4.0': 'release 0.4.0',
      },
      notifier,
      logger: asLogger(logger),
      sleep: async () => {},
      rateLimitMs: 0,
    });

    expect(notifier.sent.map((s) => s.payload.body)).toEqual(['release 0.2.0']);
    expect(getUserById(id)?.notified_version).toBe('0.4.0');
  });

  it('outer rateLimitMs is applied between users, not collapsed with intra-user delay', async () => {
    makeUser('1', '0.1.0', 'on');
    makeUser('2', '0.1.0', 'on');
    const notifier = new FakeNotifier();
    const logger = makeFakeLogger();
    const sleepCalls: number[] = [];

    await announceNewVersion({
      currentVersion: '0.3.0',
      announcements: {
        '0.2.0': 'release 0.2.0',
        '0.3.0': 'release 0.3.0',
      },
      notifier,
      logger: asLogger(logger),
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
      rateLimitMs: 100,
    });

    // Per-user: 1 intra-user gap (1500) + 1 trailing inter-user gap (100).
    // Two users → [1500, 100, 1500, 100].
    expect(sleepCalls).toEqual([1500, 100, 1500, 100]);
    expect(notifier.sent).toHaveLength(4);
  });
});

describe('validateAnnouncements', () => {
  function makeContent(herbIds: readonly string[]): AnnouncementValidatorContent {
    const byId = new Map<string, unknown>(herbIds.map((id) => [id, {}]));
    return { herbs: { byId } };
  }

  it('passes with no entries', () => {
    expect(() => validateAnnouncements({}, makeContent([]))).not.toThrow();
  });

  it('passes when no entries opt in to a CTA (string + body-only object)', () => {
    expect(() =>
      validateAnnouncements(
        {
          '0.1.0': 'plain string entry',
          '0.2.0': { body: 'object entry without CTA' },
        },
        makeContent([]),
      ),
    ).not.toThrow();
  });

  it('passes when every CTA points at a herb the corpus knows', () => {
    expect(() =>
      validateAnnouncements(
        {
          '0.5.0': {
            body: 'go!',
            cta: { kind: 'open-herb', herbId: 'ginseng' },
          },
        },
        makeContent(['ginseng']),
      ),
    ).not.toThrow();
  });

  it('throws with the version + herb id when CTA points at a missing herb', () => {
    expect(() =>
      validateAnnouncements(
        {
          '0.5.0': {
            body: 'go!',
            cta: { kind: 'open-herb', herbId: 'ghost-herb' },
          },
        },
        makeContent(['ginseng']),
      ),
    ).toThrow(/0\.5\.0[\s\S]*ghost-herb/);
  });

  it('throws when herb:<id> exceeds 64 bytes', () => {
    // 5-byte prefix `herb:` + 60 ASCII chars = 65 bytes.
    const oversized = 'a'.repeat(60);
    expect(() =>
      validateAnnouncements(
        {
          '0.6.0': {
            body: 'go!',
            cta: { kind: 'open-herb', herbId: oversized },
          },
        },
        makeContent([oversized]),
      ),
    ).toThrow(/0\.6\.0[\s\S]*65 bytes/);
  });
});
