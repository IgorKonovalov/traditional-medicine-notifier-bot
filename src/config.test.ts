import { describe, expect, it } from 'vitest';

import { parseAdminTelegramIds } from './config';

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
