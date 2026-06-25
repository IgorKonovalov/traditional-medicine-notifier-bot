import { describe, expect, it } from 'vitest';

import { assertValidTimezone, parseAdminTelegramIds } from './config';

describe('parseAdminTelegramIds', () => {
  it('returns an empty set for unset input', () => {
    const { ids, malformed } = parseAdminTelegramIds(undefined);
    expect(ids.size).toBe(0);
    expect(malformed).toEqual([]);
  });

  it('splits, trims, and separates malformed entries', () => {
    const { ids, malformed } = parseAdminTelegramIds(' 123 , 456 ,abc, ');
    expect([...ids].sort()).toEqual(['123', '456']);
    expect(malformed).toEqual(['abc']);
  });
});

describe('assertValidTimezone', () => {
  it('returns valid IANA zones unchanged', () => {
    expect(assertValidTimezone('UTC')).toBe('UTC');
    expect(assertValidTimezone('Europe/Moscow')).toBe('Europe/Moscow');
    expect(assertValidTimezone('Asia/Shanghai')).toBe('Asia/Shanghai');
  });

  it('throws on an unknown zone', () => {
    expect(() => assertValidTimezone('Mars/Olympus')).toThrow(/Invalid TIMEZONE/);
    expect(() => assertValidTimezone('')).toThrow(/Invalid TIMEZONE/);
  });
});
