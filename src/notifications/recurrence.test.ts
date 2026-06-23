import { describe, expect, it } from 'vitest';

import { computeNextFire, zonedWallTimeToEpoch } from './recurrence';

describe('computeNextFire', () => {
  it('returns null for a one-shot reminder', () => {
    expect(computeNextFire({ kind: 'once' }, Date.UTC(2026, 0, 1, 9, 0), 'UTC')).toBeNull();
  });

  it('finds the next daily time later today', () => {
    const after = Date.UTC(2026, 0, 1, 7, 0); // 07:00 UTC
    const next = computeNextFire({ kind: 'daily', times: ['08:00', '20:00'] }, after, 'UTC');
    expect(next).toBe(Date.UTC(2026, 0, 1, 8, 0));
  });

  it('rolls over to the next day when all times have passed', () => {
    const after = Date.UTC(2026, 0, 1, 21, 0); // after 20:00
    const next = computeNextFire({ kind: 'daily', times: ['08:00', '20:00'] }, after, 'UTC');
    expect(next).toBe(Date.UTC(2026, 0, 2, 8, 0));
  });

  it('honors weekly weekdays (0=Sun..6=Sat)', () => {
    // 2026-01-01 is a Thursday (weekday 4). Ask for Saturday (6) at 09:00.
    const after = Date.UTC(2026, 0, 1, 12, 0);
    const next = computeNextFire({ kind: 'weekly', weekdays: [6], times: ['09:00'] }, after, 'UTC');
    expect(next).toBe(Date.UTC(2026, 0, 3, 9, 0)); // Sat 2026-01-03
  });
});

describe('zonedWallTimeToEpoch', () => {
  it('resolves a wall-clock time in a positive-offset zone', () => {
    // 08:00 in Europe/Belgrade (UTC+1 in January) == 07:00 UTC.
    expect(zonedWallTimeToEpoch('2026-01-15', '08:00', 'Europe/Belgrade')).toBe(
      Date.UTC(2026, 0, 15, 7, 0),
    );
  });
});
