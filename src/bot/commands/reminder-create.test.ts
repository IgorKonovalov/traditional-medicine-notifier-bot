import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Telegraf, type Context } from 'telegraf';

import { ensureUser } from '../../db/repositories/user.repo';
import { setupTestDb, teardownTestDb } from '../../db/test-helper';
import type { BotDeps } from '../context';
import { type AnchoredSession, loadSession, saveSession, SESSION_TTL_MS } from '../session-store';
import {
  type ReminderDraft,
  draftToRecurrence,
  firstFireAt,
  herbPageSlice,
  normalizeTimes,
  registerReminderCreateCommand,
  stepsFor,
  timeView,
  validateDraft,
} from './reminder-create';

/** Build a draft from partial fields over the empty base. */
function draft(partial: Partial<ReminderDraft>): ReminderDraft {
  return { step: 'confirm', times: [], weekdays: [], ...partial };
}

type Btn = { text: string; callback_data?: string };

/** Flat list of inline-keyboard buttons from a built view's keyboard. */
function buttons(view: ReturnType<typeof timeView>): Btn[] {
  return view.keyboard.reply_markup.inline_keyboard.flat() as Btn[];
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

describe('timeView (Plan 022 minute-mode picker)', () => {
  it('shows the minute toggle with ✓ on the active mode (default :00)', () => {
    const btns = buttons(timeView(draft({ step: 'time', kind: 'daily' })));
    const min00 = btns.find((b) => b.callback_data === 'rc:min:00');
    const min30 = btns.find((b) => b.callback_data === 'rc:min:30');
    expect(min00?.text).toBe('✓ :00');
    expect(min30?.text).toBe(':30');
  });

  it('marks the :30 toggle active and leaves :00 unmarked when minuteMode is 30', () => {
    const btns = buttons(timeView(draft({ step: 'time', kind: 'daily', minuteMode: '30' })));
    expect(btns.find((b) => b.callback_data === 'rc:min:00')?.text).toBe(':00');
    expect(btns.find((b) => b.callback_data === 'rc:min:30')?.text).toBe('✓ :30');
  });

  it('emits rc:time:HHmm hour buttons for the active mode', () => {
    const at00 = buttons(timeView(draft({ step: 'time', kind: 'daily', minuteMode: '00' })));
    expect(at00.some((b) => b.callback_data === 'rc:time:0800')).toBe(true);
    expect(at00.some((b) => b.callback_data === 'rc:time:2300')).toBe(true);
    expect(at00.some((b) => b.callback_data === 'rc:time:0830')).toBe(false);

    const at30 = buttons(timeView(draft({ step: 'time', kind: 'daily', minuteMode: '30' })));
    expect(at30.some((b) => b.callback_data === 'rc:time:0830')).toBe(true);
    expect(at30.some((b) => b.callback_data === 'rc:time:2330')).toBe(true);
  });

  it('checkmarks only hours selected at the current mode', () => {
    const d = draft({ step: 'time', kind: 'daily', minuteMode: '00', times: ['08:00', '14:30'] });
    const at00 = buttons(timeView(d));
    expect(at00.find((b) => b.callback_data === 'rc:time:0800')?.text).toBe('✓ 08');
    // 14:30 is not selected at the :00 mode, so its hour shows no checkmark
    expect(at00.find((b) => b.callback_data === 'rc:time:1400')?.text).toBe('14');

    const d30 = { ...d, minuteMode: '30' as const };
    const at30 = buttons(timeView(d30));
    expect(at30.find((b) => b.callback_data === 'rc:time:1430')?.text).toBe('✓ 14');
    expect(at30.find((b) => b.callback_data === 'rc:time:0830')?.text).toBe('08');
  });

  it('lists the full sorted concrete set under a Выбрано line when times exist', () => {
    const v = timeView(draft({ step: 'time', kind: 'daily', times: ['14:30', '08:00'] }));
    expect(v.text).toContain('Выбрано: 08:00, 14:30');
  });

  it('omits the Выбрано line when no times are selected', () => {
    const v = timeView(draft({ step: 'time', kind: 'daily', times: [] }));
    expect(v.text).not.toContain('Выбрано');
  });

  it('offers a Далее button for recurring kinds but not for once', () => {
    const daily = buttons(timeView(draft({ step: 'time', kind: 'daily' })));
    const once = buttons(timeView(draft({ step: 'time', kind: 'once' })));
    expect(daily.some((b) => b.callback_data === 'rc:next')).toBe(true);
    expect(once.some((b) => b.callback_data === 'rc:next')).toBe(false);
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

  it('carries a :30 selection through to a minute-30 next_fire_at (Plan 022)', () => {
    const now = Date.UTC(2026, 0, 1, 7, 0);
    const d = draft({ kind: 'daily', minuteMode: '30', times: ['14:30'] });
    expect(draftToRecurrence(d)).toEqual({ kind: 'daily', times: ['14:30'] });
    expect(firstFireAt(d, now, tz)).toBe(Date.UTC(2026, 0, 1, 14, 30));
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

describe('rc:min minute-mode toggle handler (Plan 022)', () => {
  type Handler = (ctx: Context) => Promise<unknown>;
  const ANCHOR_ID = 7;

  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  /** Register the wizard against a stub, capturing action handlers by regex source. */
  function captureActions(): Map<string, Handler> {
    const actions = new Map<string, Handler>();
    const stub = {
      action: (matcher: RegExp, handler: Handler) => {
        actions.set(matcher.source, handler);
      },
    } as unknown as Telegraf;
    const deps = {
      timezone: 'Europe/Moscow',
      content: { herbs: { all: [] } },
    } as unknown as BotDeps;
    registerReminderCreateCommand(stub, deps);
    return actions;
  }

  function seedSession(state: ReminderDraft): number {
    const userId = ensureUser('1', 'u');
    const session: AnchoredSession<ReminderDraft> = { anchor: { messageId: ANCHOR_ID }, state };
    saveSession(userId, 'reminder-create', session, SESSION_TTL_MS);
    return userId;
  }

  interface Edit {
    text: string;
    buttonLabels: string[];
  }

  function makeCtx(userId: number, mode: '00' | '30'): { ctx: Context; edits: Edit[] } {
    const edits: Edit[] = [];
    const ctx = {
      state: { userId },
      match: [`rc:min:${mode}`, mode],
      callbackQuery: { message: { message_id: ANCHOR_ID } },
      answerCbQuery: () => Promise.resolve(true),
      editMessageText: (
        text: string,
        kb: { reply_markup?: { inline_keyboard: { text: string }[][] } } | undefined,
      ) => {
        const buttonLabels = (kb?.reply_markup?.inline_keyboard ?? []).flat().map((b) => b.text);
        edits.push({ text, buttonLabels });
        return Promise.resolve(true);
      },
    } as unknown as Context;
    return { ctx, edits };
  }

  it('flips minuteMode and re-renders without changing step or times', async () => {
    const userId = seedSession({
      step: 'time',
      kind: 'daily',
      minuteMode: '00',
      times: ['08:00'],
      weekdays: [],
    });
    const handler = captureActions().get('^rc:min:(00|30)$');
    expect(handler).toBeDefined();

    const { ctx, edits } = makeCtx(userId, '30');
    await handler!(ctx);

    const after = loadSession<AnchoredSession<ReminderDraft>>(userId, 'reminder-create');
    expect(after?.state.minuteMode).toBe('30');
    expect(after?.state.step).toBe('time');
    expect(after?.state.times).toEqual(['08:00']);
    expect(edits).toHaveLength(1);
    expect(edits[0]!.buttonLabels).toContain('✓ :30');
    expect(edits[0]!.buttonLabels).toContain(':00');
  });
});
