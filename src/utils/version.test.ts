import { afterEach, describe, expect, it } from 'vitest';

import { __resetVersionCacheForTests, getVersion } from './version';

describe('getVersion', () => {
  afterEach(() => {
    __resetVersionCacheForTests();
  });

  it('returns the package.json version string', () => {
    // Matches the semver shape `package.json` declares; the exact value moves
    // with each release so we assert the shape, not a literal.
    expect(getVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('caches the value across calls (same reference)', () => {
    const first = getVersion();
    const second = getVersion();
    expect(second).toBe(first);
  });
});
