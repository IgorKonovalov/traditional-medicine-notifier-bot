/**
 * Version-broadcast repository queries (plan 010): the candidate selector, the
 * notified-version watermark, and the strict opt-in reader.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setupTestDb, teardownTestDb } from '../test-helper';
import {
  ensureUser,
  findActiveUsersBehindCurrentVersion,
  getFeatureAnnouncementsEnabled,
  getUserById,
  getUserTimezone,
  markInactive,
  markNotified,
  setSetting,
  SETTING_FEATURE_ANNOUNCEMENTS,
  SETTING_TIMEZONE,
} from './user.repo';

describe('findActiveUsersBehindCurrentVersion', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  it('returns active users whose notified_version is null or stale', () => {
    const stale = ensureUser('1', 'stale');
    markNotified(stale, '0.1.0');
    const fresh = ensureUser('2', 'fresh');
    markNotified(fresh, '0.2.0');
    const nullVersion = ensureUser('3', 'null'); // notified_version stays NULL

    const candidates = findActiveUsersBehindCurrentVersion('0.2.0');
    expect(candidates.map((c) => c.id).sort((a, b) => a - b)).toEqual(
      [stale, nullVersion].sort((a, b) => a - b),
    );
  });

  it('excludes inactive users (dead chats)', () => {
    const active = ensureUser('1', 'active');
    markNotified(active, '0.1.0');
    const dead = ensureUser('2', 'dead');
    markNotified(dead, '0.1.0');
    markInactive(dead);

    const candidates = findActiveUsersBehindCurrentVersion('0.2.0');
    expect(candidates.map((c) => c.id)).toEqual([active]);
  });

  it('projects optedIn from the feature_announcements setting (LEFT JOIN keeps opted-out rows)', () => {
    const optedIn = ensureUser('1', 'in');
    setSetting(optedIn, SETTING_FEATURE_ANNOUNCEMENTS, '1');
    const optedOut = ensureUser('2', 'out');
    setSetting(optedOut, SETTING_FEATURE_ANNOUNCEMENTS, '0');
    const noRow = ensureUser('3', 'default'); // no setting row at all

    const byId = new Map(
      findActiveUsersBehindCurrentVersion('0.2.0').map((c) => [c.id, c.optedIn]),
    );
    expect(byId.get(optedIn)).toBe(true);
    expect(byId.get(optedOut)).toBe(false);
    expect(byId.get(noRow)).toBe(false);
  });
});

describe('markNotified', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  it('advances the per-user watermark', () => {
    const id = ensureUser('1', 'u');
    markNotified(id, '0.3.0');
    expect(getUserById(id)?.notified_version).toBe('0.3.0');
  });
});

describe('getUserTimezone', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  it('returns the fallback when no timezone is set', () => {
    const id = ensureUser('1', 'u');
    expect(getUserTimezone(id, 'Europe/Belgrade')).toBe('Europe/Belgrade');
  });

  it('returns the stored zone when set', () => {
    const id = ensureUser('1', 'u');
    setSetting(id, SETTING_TIMEZONE, 'Europe/Moscow');
    expect(getUserTimezone(id, 'Europe/Belgrade')).toBe('Europe/Moscow');
  });

  it('falls back on a corrupt stored value rather than throwing', () => {
    const id = ensureUser('1', 'u');
    setSetting(id, SETTING_TIMEZONE, 'Not/AZone');
    expect(getUserTimezone(id, 'Europe/Belgrade')).toBe('Europe/Belgrade');
  });
});

describe('getFeatureAnnouncementsEnabled', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  it('is strict opt-in: only an explicit "1" enables', () => {
    const id = ensureUser('1', 'u');
    expect(getFeatureAnnouncementsEnabled(id)).toBe(false); // absent row
    setSetting(id, SETTING_FEATURE_ANNOUNCEMENTS, '0');
    expect(getFeatureAnnouncementsEnabled(id)).toBe(false);
    setSetting(id, SETTING_FEATURE_ANNOUNCEMENTS, '1');
    expect(getFeatureAnnouncementsEnabled(id)).toBe(true);
  });
});
