import { describe, expect, it } from 'vitest';

import { assertCallbackData, pager } from './keyboards';

/** Extract the `callback_data` strings from a pager row, in order. */
function data(row: ReturnType<typeof pager>): string[] {
  return row.map((b) => ('callback_data' in b ? b.callback_data : ''));
}

describe('assertCallbackData', () => {
  it('returns the payload unchanged when within the 64-byte limit', () => {
    expect(assertCallbackData('lib:open:dang-gui')).toBe('lib:open:dang-gui');
    expect(assertCallbackData('x'.repeat(64))).toHaveLength(64);
  });

  it('throws past 64 bytes (ASCII)', () => {
    expect(() => assertCallbackData('x'.repeat(65))).toThrow(/64-byte limit/);
  });

  it('counts bytes, not characters, for multi-byte payloads', () => {
    // Cyrillic is 2 bytes/char in UTF-8, so 33 chars = 66 bytes > limit.
    expect(() => assertCallbackData('я'.repeat(33))).toThrow(/64-byte limit/);
    expect(assertCallbackData('я'.repeat(32))).toHaveLength(32); // 64 bytes — at the edge
  });
});

describe('pager', () => {
  it('renders prev / indicator / next in order', () => {
    const row = pager('lib:page', 1, 3);
    expect(row).toHaveLength(3);
    expect(data(row)).toEqual(['lib:page:0', 'lib:page:noop', 'lib:page:2']);
  });

  it('does not wrap past the first page — prev points at noop', () => {
    expect(data(pager('lib:page', 0, 3))).toEqual(['lib:page:noop', 'lib:page:noop', 'lib:page:1']);
  });

  it('does not wrap past the last page — next points at noop', () => {
    expect(data(pager('lib:page', 2, 3))).toEqual(['lib:page:1', 'lib:page:noop', 'lib:page:noop']);
  });

  it('is fully inert for a single-page list', () => {
    expect(data(pager('lib:page', 0, 1))).toEqual([
      'lib:page:noop',
      'lib:page:noop',
      'lib:page:noop',
    ]);
  });
});
