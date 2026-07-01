import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Telegraf, type Context } from 'telegraf';

import type { Combination } from '../../content/types';
import { ensureUser } from '../../db/repositories/user.repo';
import { setupTestDb, teardownTestDb } from '../../db/test-helper';
import type { BotDeps } from '../context';
import { type AnchoredSession, loadSession, saveSession, SESSION_TTL_MS } from '../session-store';
import type { ScheduledReminder } from '../../notifications/types';
import {
  type ReminderDraft,
  buildReminderMessage,
  draftToRecurrence,
  firstFireAt,
  formulaPickerView,
  herbPageSlice,
  normalizeTimes,
  registerReminderCreateCommand,
  stepsFor,
  timeView,
  validateDraft,
  view,
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

describe('stepsFor (Plan 024 link + intake)', () => {
  it('includes the link step (no intake) on the ingredient/skip path', () => {
    expect(stepsFor('daily', false, false)).toEqual(['label', 'link', 'kind', 'time', 'confirm']);
  });

  it('inserts the intake step after link when a formula is linked', () => {
    expect(stepsFor('daily', false, true)).toEqual([
      'label',
      'link',
      'intake',
      'kind',
      'time',
      'confirm',
    ]);
  });

  it('omits both link and intake when the herb was pre-linked at entry', () => {
    expect(stepsFor('daily', true, false)).toEqual(['label', 'kind', 'time', 'confirm']);
  });

  it('places link before kind for every recurrence kind', () => {
    for (const kind of ['once', 'weekly', 'interval'] as const) {
      const steps = stepsFor(kind, false, false);
      expect(steps.indexOf('link')).toBe(1);
      expect(steps.indexOf('link')).toBeLessThan(steps.indexOf('kind'));
    }
  });

  it('keeps the link (+ intake) head while kind is still undefined', () => {
    expect(stepsFor(undefined, false, false)).toEqual(['label', 'link', 'kind']);
    expect(stepsFor(undefined, false, true)).toEqual(['label', 'link', 'intake', 'kind']);
    expect(stepsFor(undefined, true, false)).toEqual(['label', 'kind']);
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

  it('emits 2-digit rc:time:HH hour buttons regardless of the active mode (Plan 024)', () => {
    // The minute is no longer baked into the callback — only the hour rides it;
    // the commit handler combines it with the server-side minuteMode.
    const at00 = buttons(timeView(draft({ step: 'time', kind: 'daily', minuteMode: '00' })));
    expect(at00.some((b) => b.callback_data === 'rc:time:08')).toBe(true);
    expect(at00.some((b) => b.callback_data === 'rc:time:23')).toBe(true);
    expect(at00.some((b) => b.callback_data === 'rc:time:0800')).toBe(false);

    const at30 = buttons(timeView(draft({ step: 'time', kind: 'daily', minuteMode: '30' })));
    expect(at30.some((b) => b.callback_data === 'rc:time:08')).toBe(true);
    expect(at30.some((b) => b.callback_data === 'rc:time:23')).toBe(true);
    expect(at30.some((b) => b.callback_data === 'rc:time:0830')).toBe(false);
  });

  it('checkmarks only hours selected at the current mode', () => {
    const d = draft({ step: 'time', kind: 'daily', minuteMode: '00', times: ['08:00', '14:30'] });
    const at00 = buttons(timeView(d));
    expect(at00.find((b) => b.callback_data === 'rc:time:08')?.text).toBe('✓ 08');
    // 14:30 is not selected at the :00 mode, so its hour shows no checkmark
    expect(at00.find((b) => b.callback_data === 'rc:time:14')?.text).toBe('14');

    const d30 = { ...d, minuteMode: '30' as const };
    const at30 = buttons(timeView(d30));
    expect(at30.find((b) => b.callback_data === 'rc:time:14')?.text).toBe('✓ 14');
    expect(at30.find((b) => b.callback_data === 'rc:time:08')?.text).toBe('08');
  });

  it('offers a Далее button for every kind (a tap selects, «Далее» advances)', () => {
    const daily = buttons(timeView(draft({ step: 'time', kind: 'daily' })));
    const once = buttons(timeView(draft({ step: 'time', kind: 'once' })));
    const weekly = buttons(timeView(draft({ step: 'time', kind: 'weekly' })));
    expect(daily.some((b) => b.callback_data === 'rc:next')).toBe(true);
    expect(once.some((b) => b.callback_data === 'rc:next')).toBe(true);
    expect(weekly.some((b) => b.callback_data === 'rc:next')).toBe(true);
  });

  it('echoes the chosen single time under a Выбрано line', () => {
    expect(timeView(draft({ step: 'time', kind: 'daily', times: ['08:30'] })).text).toContain(
      'Выбрано: 08:30',
    );
    expect(timeView(draft({ step: 'time', kind: 'daily', times: [] })).text).not.toContain(
      'Выбрано',
    );
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

describe('rc:time commit handler (Plan 024 .30 fix)', () => {
  type Handler = (ctx: Context) => Promise<unknown>;
  const ANCHOR_ID = 11;

  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

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

  /** A ctx whose callback carries only the hour (`rc:time:08`), like the live keyboard. */
  function makeCtx(userId: number, hh: string): Context {
    return {
      state: { userId },
      match: [`rc:time:${hh}`, hh],
      callbackQuery: { message: { message_id: ANCHOR_ID } },
      answerCbQuery: () => Promise.resolve(true),
      editMessageText: () => Promise.resolve(true),
    } as unknown as Context;
  }

  it('commits HH:30 from the server-side minuteMode, not the callback', async () => {
    const userId = seedSession({
      step: 'time',
      kind: 'daily',
      minuteMode: '30',
      times: [],
      weekdays: [],
    });
    const handler = captureActions().get('^rc:time:(\\d{2})$');
    expect(handler).toBeDefined();

    await handler!(makeCtx(userId, '08'));

    const after = loadSession<AnchoredSession<ReminderDraft>>(userId, 'reminder-create');
    // Even though the callback carried no minute, the slot follows draft.minuteMode.
    expect(after?.state.times).toEqual(['08:30']);
    // A tap only selects — the user advances with «Далее».
    expect(after?.state.step).toBe('time');
  });

  it('replaces any prior time (single-select) instead of accumulating', async () => {
    // The owner-reported bug: tapping a second hour used to append (e.g.
    // "10:00, 12:30"). A tap must now replace the prior selection outright.
    const userId = seedSession({
      step: 'time',
      kind: 'daily',
      minuteMode: '30',
      times: ['10:00'],
      weekdays: [],
    });
    const handler = captureActions().get('^rc:time:(\\d{2})$');

    await handler!(makeCtx(userId, '12'));

    const after = loadSession<AnchoredSession<ReminderDraft>>(userId, 'reminder-create');
    expect(after?.state.times).toEqual(['12:30']);
    expect(after?.state.step).toBe('time');
  });

  it('still follows minuteMode after a mode switch the keyboard had not yet re-rendered', async () => {
    // Simulates the race: the user switched to :30 (server state) but the old
    // :00 keyboard is still on screen; an hour tap must commit :30, not :00.
    const userId = seedSession({
      step: 'time',
      kind: 'once',
      minuteMode: '30',
      times: [],
      weekdays: [],
    });
    const handler = captureActions().get('^rc:time:(\\d{2})$');

    await handler!(makeCtx(userId, '09'));

    const after = loadSession<AnchoredSession<ReminderDraft>>(userId, 'reminder-create');
    expect(after?.state.times).toEqual(['09:30']);
    // A tap only selects (all kinds) — no auto-advance past the time step.
    expect(after?.state.step).toBe('time');
  });

  it('commits HH:00 when minuteMode is the default 00', async () => {
    const userId = seedSession({
      step: 'time',
      kind: 'daily',
      minuteMode: '00',
      times: [],
      weekdays: [],
    });
    const handler = captureActions().get('^rc:time:(\\d{2})$');

    await handler!(makeCtx(userId, '08'));

    const after = loadSession<AnchoredSession<ReminderDraft>>(userId, 'reminder-create');
    expect(after?.state.times).toEqual(['08:00']);
    expect(after?.state.step).toBe('time');
  });

  it('rc:next advances from the time step once a time is chosen, else toasts', async () => {
    const actions = captureActions();
    const next = actions.get('^rc:next$');
    expect(next).toBeDefined();

    // No time chosen yet → stays on the time step (a needTime toast is shown).
    const empty = seedSession({
      step: 'time',
      kind: 'daily',
      minuteMode: '00',
      times: [],
      weekdays: [],
    });
    await next!(makeCtx(empty, '08'));
    expect(loadSession<AnchoredSession<ReminderDraft>>(empty, 'reminder-create')?.state.step).toBe(
      'time',
    );

    // A time chosen → «Далее» advances past the time step.
    const ready = seedSession({
      step: 'time',
      kind: 'daily',
      minuteMode: '00',
      times: ['08:00'],
      weekdays: [],
    });
    await next!(makeCtx(ready, '08'));
    expect(
      loadSession<AnchoredSession<ReminderDraft>>(ready, 'reminder-create')?.state.step,
    ).not.toBe('time');
  });
});

// ─── Plan 024: link type-picker, formula picker, intake step ───────────────────

const FORMULAS = [
  { id: 'tib-formula-agar-8', nameRu: 'Агар-8' },
  { id: 'tib-formula-byuruma-13', nameRu: 'Бьюрума-13' },
] as unknown as Combination[];

describe('buildReminderMessage (Plan 024 fired-notification payload)', () => {
  function reminder(partial: Partial<ScheduledReminder>): ScheduledReminder {
    return {
      id: 1,
      userId: 1,
      label: 'Принимать',
      herbId: null,
      combinationId: null,
      intakeType: null,
      recurrence: { kind: 'daily', times: ['08:00'] },
      nextFireAt: 0,
      active: true,
      createdAt: 0,
      ...partial,
    };
  }

  const names = {
    formulaName: (id: string) => (id === 'tib-formula-agar-8' ? 'Агар-8' : undefined),
    herbName: (id: string) => (id === 'tib-ginger' ? 'Имбирь' : undefined),
  };

  it('builds an open-formula CTA and echoes the intake type for a formula reminder', () => {
    const payload = buildReminderMessage(
      reminder({ combinationId: 'tib-formula-agar-8', intakeType: 'decoction' }),
      names,
    );
    expect(payload.cta).toEqual({ kind: 'open-formula', combinationId: 'tib-formula-agar-8' });
    expect(payload.body).toContain('Принимать');
    expect(payload.body).toContain('🍶 Приём: отвар');
  });

  it('names the linked состав in a formula reminder body', () => {
    const payload = buildReminderMessage(reminder({ combinationId: 'tib-formula-agar-8' }), names);
    expect(payload.body).toContain('🧪 Состав: Агар-8');
  });

  it('names the linked ingredient in a herb reminder body', () => {
    const payload = buildReminderMessage(reminder({ herbId: 'tib-ginger' }), names);
    expect(payload.body).toContain('🌿 Ингредиент: Имбирь');
  });

  it('omits the intake line for a formula reminder with no intake type', () => {
    const payload = buildReminderMessage(reminder({ combinationId: 'tib-formula-agar-8' }), names);
    expect(payload.cta).toEqual({ kind: 'open-formula', combinationId: 'tib-formula-agar-8' });
    expect(payload.body).not.toContain('🍶 Приём');
  });

  it('builds an open-herb CTA for a herb reminder (unchanged)', () => {
    const payload = buildReminderMessage(reminder({ herbId: 'tib-ginger' }), names);
    expect(payload.cta).toEqual({ kind: 'open-herb', herbId: 'tib-ginger' });
    expect(payload.body).not.toContain('🍶 Приём');
  });

  it('degrades gracefully without a name lookup (no linked line)', () => {
    const payload = buildReminderMessage(reminder({ herbId: 'tib-ginger' }));
    expect(payload.cta).toEqual({ kind: 'open-herb', herbId: 'tib-ginger' });
    expect(payload.body).not.toContain('🌿 Ингредиент');
  });

  it('carries no CTA for a free-text reminder', () => {
    const payload = buildReminderMessage(reminder({}));
    expect(payload.cta).toBeUndefined();
  });
});

describe('formulaPickerView (Plan 024)', () => {
  it('lists formulas with rc:formula:<id> callbacks and a back-to-choose row', () => {
    const v = formulaPickerView(draft({ step: 'link', linkView: 'formulas' }), FORMULAS);
    const btns = buttons(v);
    expect(btns.find((b) => b.text === 'Агар-8')?.callback_data).toBe(
      'rc:formula:tib-formula-agar-8',
    );
    expect(btns.some((b) => b.callback_data === 'rc:link:back')).toBe(true);
    // The skip button lives on the type picker, not inside the browser.
    expect(btns.some((b) => b.callback_data === 'rc:link:skip')).toBe(false);
  });
});

describe('confirm render with a linked formula + intake (Plan 024)', () => {
  const deps = {
    timezone: 'UTC',
    content: {
      herbs: { all: [], byId: new Map() },
      combinations: {
        all: FORMULAS,
        byId: new Map(FORMULAS.map((f) => [f.id, f])),
      },
    },
  } as unknown as BotDeps;

  it('renders a 🧪 Состав line and a 🍶 Приём line for a formula reminder', () => {
    const v = view(
      draft({
        step: 'confirm',
        label: 'Принимать состав',
        kind: 'daily',
        times: ['08:00'],
        combinationId: 'tib-formula-agar-8',
        intakeType: 'decoction',
      }),
      deps,
      Date.UTC(2026, 0, 1, 7, 0),
    );
    expect(v.text).toContain('🧪 Состав: Агар-8');
    expect(v.text).toContain('🍶 Приём: отвар');
  });
});

describe('link / formula / intake handlers (Plan 024)', () => {
  type Handler = (ctx: Context) => Promise<unknown>;
  const ANCHOR_ID = 21;

  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  function captureActions(): Map<string, Handler> {
    const actions = new Map<string, Handler>();
    const stub = {
      action: (matcher: RegExp, handler: Handler) => {
        actions.set(matcher.source, handler);
      },
    } as unknown as Telegraf;
    const deps = {
      timezone: 'Europe/Moscow',
      content: {
        herbs: { all: [], byId: new Map() },
        combinations: {
          all: FORMULAS,
          byId: new Map(FORMULAS.map((f) => [f.id, f])),
        },
      },
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

  function makeCtx(userId: number, data: string, arg: string): Context {
    return {
      state: { userId },
      match: [data, arg],
      callbackQuery: { message: { message_id: ANCHOR_ID } },
      answerCbQuery: () => Promise.resolve(true),
      editMessageText: () => Promise.resolve(true),
    } as unknown as Context;
  }

  it('rc:formula:<id> links the formula, clears any herb, and advances to intake', async () => {
    const userId = seedSession({
      step: 'link',
      linkView: 'formulas',
      herbId: 'tib-ginger',
      times: [],
      weekdays: [],
    });
    const handler = captureActions().get('^rc:formula:(.+)$');
    expect(handler).toBeDefined();

    await handler!(makeCtx(userId, 'rc:formula:tib-formula-agar-8', 'tib-formula-agar-8'));

    const after = loadSession<AnchoredSession<ReminderDraft>>(userId, 'reminder-create');
    expect(after?.state.combinationId).toBe('tib-formula-agar-8');
    expect(after?.state.herbId).toBeUndefined();
    expect(after?.state.step).toBe('intake');
  });

  it('rc:intake:decoction records the intake type and advances to kind', async () => {
    const userId = seedSession({
      step: 'intake',
      combinationId: 'tib-formula-agar-8',
      times: [],
      weekdays: [],
    });
    const handler = captureActions().get('^rc:intake:(plain|decoction)$');
    expect(handler).toBeDefined();

    await handler!(makeCtx(userId, 'rc:intake:decoction', 'decoction'));

    const after = loadSession<AnchoredSession<ReminderDraft>>(userId, 'reminder-create');
    expect(after?.state.intakeType).toBe('decoction');
    expect(after?.state.step).toBe('kind');
  });

  it('rc:link:skip clears any link and advances to kind (no intake)', async () => {
    const userId = seedSession({
      step: 'link',
      linkView: 'choose',
      combinationId: 'tib-formula-agar-8',
      intakeType: 'plain',
      times: [],
      weekdays: [],
    });
    const handler = captureActions().get('^rc:link:skip$');

    await handler!(makeCtx(userId, 'rc:link:skip', 'skip'));

    const after = loadSession<AnchoredSession<ReminderDraft>>(userId, 'reminder-create');
    expect(after?.state.combinationId).toBeUndefined();
    expect(after?.state.herbId).toBeUndefined();
    expect(after?.state.intakeType).toBeUndefined();
    expect(after?.state.step).toBe('kind');
  });

  it('rc:herb:<id> on the ingredient path clears a previously chosen formula', async () => {
    const userId = seedSession({
      step: 'link',
      linkView: 'herbs',
      combinationId: 'tib-formula-agar-8',
      intakeType: 'plain',
      times: [],
      weekdays: [],
    });
    // The harness herbs.byId is empty, so seed one so the id resolves.
    const deps = {
      timezone: 'Europe/Moscow',
      content: {
        herbs: { all: [], byId: new Map([['tib-ginger', { id: 'tib-ginger', nameRu: 'Имбирь' }]]) },
        combinations: { all: FORMULAS, byId: new Map(FORMULAS.map((f) => [f.id, f])) },
      },
    } as unknown as BotDeps;
    const actions = new Map<string, Handler>();
    const stub = {
      action: (m: RegExp, h: Handler) => actions.set(m.source, h),
    } as unknown as Telegraf;
    registerReminderCreateCommand(stub, deps);

    await actions.get('^rc:herb:(.+)$')!(makeCtx(userId, 'rc:herb:tib-ginger', 'tib-ginger'));

    const after = loadSession<AnchoredSession<ReminderDraft>>(userId, 'reminder-create');
    expect(after?.state.herbId).toBe('tib-ginger');
    expect(after?.state.combinationId).toBeUndefined();
    expect(after?.state.intakeType).toBeUndefined();
    expect(after?.state.step).toBe('kind');
  });
});
