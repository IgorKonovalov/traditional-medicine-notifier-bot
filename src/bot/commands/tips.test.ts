import { afterEach, describe, expect, it } from 'vitest';

import type { Tip } from '../../content/types';

import { _resetTipHistory, getRecent, HISTORY_WINDOW, recordShown } from './tip-history';
import { pickRandomTip } from './tips';

function tip(id: string): Tip {
  return { id, body: `Тело ${id}` };
}

describe('pickRandomTip', () => {
  it('returns null on an empty pool', () => {
    expect(pickRandomTip([], new Set())).toBeNull();
  });

  it('never returns an excluded id while a non-excluded one exists', () => {
    const tips = [tip('a'), tip('b'), tip('c')];
    const exclude = new Set(['a', 'b']);
    // Sample many times — exclusion is absolute, not probabilistic.
    for (let i = 0; i < 200; i++) {
      expect(pickRandomTip(tips, exclude)?.id).toBe('c');
    }
  });

  it('falls back to the full pool when every tip is excluded', () => {
    const tips = [tip('a'), tip('b')];
    const exclude = new Set(['a', 'b']);
    const picked = pickRandomTip(tips, exclude);
    expect(picked).not.toBeNull();
    expect(['a', 'b']).toContain(picked?.id);
  });

  it('can return any non-excluded tip over many draws', () => {
    const tips = [tip('a'), tip('b'), tip('c'), tip('d')];
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const picked = pickRandomTip(tips, new Set());
      if (picked !== null) seen.add(picked.id);
    }
    expect(seen).toEqual(new Set(['a', 'b', 'c', 'd']));
  });
});

describe('tip-history ring buffer', () => {
  afterEach(() => _resetTipHistory());

  it('starts empty for an unknown user', () => {
    expect(getRecent(1)).toEqual(new Set());
  });

  it('records shown tips and reports them as recent', () => {
    recordShown(1, 'a');
    recordShown(1, 'b');
    expect(getRecent(1)).toEqual(new Set(['a', 'b']));
  });

  it('keeps history per user', () => {
    recordShown(1, 'a');
    recordShown(2, 'b');
    expect(getRecent(1)).toEqual(new Set(['a']));
    expect(getRecent(2)).toEqual(new Set(['b']));
  });

  it('evicts the oldest id once the window overflows', () => {
    for (let i = 0; i < HISTORY_WINDOW + 3; i++) recordShown(1, `t${i}`);
    const recent = getRecent(1);
    expect(recent.size).toBe(HISTORY_WINDOW);
    // The three oldest fell out; the newest window remains.
    expect(recent.has('t0')).toBe(false);
    expect(recent.has('t2')).toBe(false);
    expect(recent.has('t3')).toBe(true);
    expect(recent.has(`t${HISTORY_WINDOW + 2}`)).toBe(true);
  });
});
