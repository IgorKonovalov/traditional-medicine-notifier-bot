import { describe, expect, it } from 'vitest';

import {
  type ReminderDraft,
  draftToRecurrence,
  firstFireAt,
  herbPageSlice,
  normalizeTimes,
  stepsFor,
  validateDraft,
} from './reminder-create';

/** Build a draft from partial fields over the empty base. */
function draft(partial: Partial<ReminderDraft>): ReminderDraft {
  return { step: 'confirm', times: [], weekdays: [], ...partial };
}

describe('normalizeTimes', () => {
  it('dedupes, drops invalid entries, and sorts ascending', () => {
    expect(normalizeTimes(['20:00', '08:00', '08:00', '25:00', 'oops'])).toEqual([
      '08:00',
      '20:00',
    ]);
  });
});

describe('draftToRecurrence', () => {
  it('maps once to the bare sentinel (time/date live in next_fire_at)', () => {
    expect(draftToRecurrence(draft({ kind: 'once', times: ['09:00'], dateOffset: 1 }))).toEqual({
      kind: 'once',
    });
  });

  it('maps daily with normalized times', () => {
    expect(draftToRecurrence(draft({ kind: 'daily', times: ['20:00', '08:00'] }))).toEqual({
      kind: 'daily',
      times: ['08:00', '20:00'],
    });
  });

  it('maps weekly with sorted weekdays + times', () => {
    expect(
      draftToRecurrence(draft({ kind: 'weekly', weekdays: [6, 1], times: ['09:00'] })),
    ).toEqual({ kind: 'weekly', weekdays: [1, 6], times: ['09:00'] });
  });

  it('maps interval with everyDays', () => {
    expect(draftToRecurrence(draft({ kind: 'interval', everyDays: 3, times: ['07:00'] }))).toEqual({
      kind: 'interval',
      everyDays: 3,
      times: ['07:00'],
    });
  });
});

describe('stepsFor', () => {
  it('includes the herb step between label and kind when not pre-linked', () => {
    expect(stepsFor('daily', false)).toEqual(['label', 'herb', 'kind', 'time', 'confirm']);
  });

  it('omits the herb step when the herb was pre-linked at entry', () => {
    expect(stepsFor('daily', true)).toEqual(['label', 'kind', 'time', 'confirm']);
  });

  it('places the herb step before kind for every recurrence kind', () => {
    for (const kind of ['once', 'weekly', 'interval'] as const) {
      const steps = stepsFor(kind, false);
      expect(steps.indexOf('herb')).toBe(1);
      expect(steps.indexOf('herb')).toBeLessThan(steps.indexOf('kind'));
    }
  });

  it('keeps the herb step in the pre-kind head while kind is still undefined', () => {
    expect(stepsFor(undefined, false)).toEqual(['label', 'herb', 'kind']);
    expect(stepsFor(undefined, true)).toEqual(['label', 'kind']);
  });
});

describe('herbPageSlice', () => {
  const items = Array.from({ length: 20 }, (_, i) => `h${i}`);

  it('returns the requested page with the configured page size', () => {
    const { slice, page, pageCount } = herbPageSlice(items, 1, 8);
    expect(slice).toEqual(['h8', 'h9', 'h10', 'h11', 'h12', 'h13', 'h14', 'h15']);
    expect(page).toBe(1);
    expect(pageCount).toBe(3);
  });

  it('clamps an over-range page to the last page', () => {
    const { slice, page } = herbPageSlice(items, 99, 8);
    expect(page).toBe(2);
    expect(slice).toEqual(['h16', 'h17', 'h18', 'h19']);
  });

  it('clamps a negative page to the first page', () => {
    expect(herbPageSlice(items, -5, 8).page).toBe(0);
  });

  it('reports a single page for an empty corpus', () => {
    const { slice, page, pageCount } = herbPageSlice([], 0, 8);
    expect(slice).toEqual([]);
    expect(page).toBe(0);
    expect(pageCount).toBe(1);
  });
});

describe('firstFireAt', () => {
  const tz = 'UTC';

  it('finds today’s slot for a daily reminder when the time has not passed', () => {
    const now = Date.UTC(2026, 0, 1, 7, 0);
    expect(firstFireAt(draft({ kind: 'daily', times: ['08:00'] }), now, tz)).toBe(
      Date.UTC(2026, 0, 1, 8, 0),
    );
  });

  it('rolls a daily reminder to the next day when the time already passed', () => {
    const now = Date.UTC(2026, 0, 1, 9, 0);
    expect(firstFireAt(draft({ kind: 'daily', times: ['08:00'] }), now, tz)).toBe(
      Date.UTC(2026, 0, 2, 8, 0),
    );
  });

  it('resolves a one-shot to today at the chosen time', () => {
    const now = Date.UTC(2026, 0, 1, 7, 0);
    expect(firstFireAt(draft({ kind: 'once', times: ['08:00'], dateOffset: 0 }), now, tz)).toBe(
      Date.UTC(2026, 0, 1, 8, 0),
    );
  });

  it('resolves a one-shot to tomorrow via dateOffset', () => {
    const now = Date.UTC(2026, 0, 1, 12, 0);
    expect(firstFireAt(draft({ kind: 'once', times: ['08:00'], dateOffset: 1 }), now, tz)).toBe(
      Date.UTC(2026, 0, 2, 8, 0),
    );
  });

  it('returns null for a one-shot whose time today already passed', () => {
    const now = Date.UTC(2026, 0, 1, 9, 0);
    expect(
      firstFireAt(draft({ kind: 'once', times: ['08:00'], dateOffset: 0 }), now, tz),
    ).toBeNull();
  });

  it('honors interval everyDays', () => {
    const now = Date.UTC(2026, 0, 1, 9, 0); // after 08:00 today → next matching day
    const next = firstFireAt(draft({ kind: 'interval', everyDays: 2, times: ['08:00'] }), now, tz);
    expect(next).toBe(Date.UTC(2026, 0, 3, 8, 0));
  });
});

describe('validateDraft', () => {
  const now = Date.UTC(2026, 0, 1, 7, 0);
  const tz = 'UTC';

  it('accepts a complete daily draft', () => {
    expect(
      validateDraft(draft({ label: 'Пить воду', kind: 'daily', times: ['08:00'] }), now, tz),
    ).toBeNull();
  });

  it('rejects an empty label', () => {
    expect(validateDraft(draft({ label: '  ', kind: 'daily', times: ['08:00'] }), now, tz)).toBe(
      'label',
    );
  });

  it('rejects a missing kind', () => {
    expect(validateDraft(draft({ label: 'x', times: ['08:00'] }), now, tz)).toBe('kind');
  });

  it('rejects interval without a valid everyDays', () => {
    expect(validateDraft(draft({ label: 'x', kind: 'interval', times: ['08:00'] }), now, tz)).toBe(
      'every',
    );
  });

  it('rejects a draft with no times', () => {
    expect(validateDraft(draft({ label: 'x', kind: 'daily' }), now, tz)).toBe('time');
  });

  it('rejects weekly without a weekday', () => {
    expect(validateDraft(draft({ label: 'x', kind: 'weekly', times: ['08:00'] }), now, tz)).toBe(
      'weekday',
    );
  });

  it('rejects a one-shot in the past', () => {
    const late = Date.UTC(2026, 0, 1, 9, 0);
    expect(
      validateDraft(draft({ label: 'x', kind: 'once', times: ['08:00'], dateOffset: 0 }), late, tz),
    ).toBe('past');
  });
});
