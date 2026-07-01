import { describe, expect, it } from 'vitest';

import { assertValidTimezone } from '../config';
import { TIMEZONES, timezoneLabel } from './timezones';

describe('TIMEZONES', () => {
  it('every id is a valid IANA zone', () => {
    for (const tz of TIMEZONES) {
      expect(() => assertValidTimezone(tz.id)).not.toThrow();
    }
  });

  it('has no duplicate ids', () => {
    const ids = TIMEZONES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('offers Europe/Belgrade first (the audience default)', () => {
    expect(TIMEZONES[0]?.id).toBe('Europe/Belgrade');
  });
});

describe('timezoneLabel', () => {
  it('returns the Russian label for a known id', () => {
    expect(timezoneLabel('Europe/Belgrade')).toBe('Белград (CET)');
  });

  it('falls back to the raw id for an unknown zone', () => {
    expect(timezoneLabel('Antarctica/Troll')).toBe('Antarctica/Troll');
  });
});
