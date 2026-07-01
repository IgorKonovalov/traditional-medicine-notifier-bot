import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Telegraf, type Context } from 'telegraf';

import { createReminder, listUserReminders } from '../../db/repositories/reminder.repo';
import { ensureUser, setSetting, SETTING_TIMEZONE } from '../../db/repositories/user.repo';
import { setupTestDb, teardownTestDb } from '../../db/test-helper';
import type { ScheduledReminder } from '../../notifications/types';
import type { BotDeps } from '../context';
import { detailView, listView, registerRemindersCommand, remindersEntry } from './reminders';

type Btn = { text: string; callback_data?: string };

function buttons(view: { keyboard: { reply_markup: { inline_keyboard: Btn[][] } } }): Btn[] {
  return view.keyboard.reply_markup.inline_keyboard.flat();
}

const FORMULAS = [{ id: 'tib-formula-agar-8', nameRu: 'Агар-8' }];
const HERBS = [{ id: 'tib-ginger', nameRu: 'Имбирь' }];

function depsStub(): BotDeps {
  return {
    timezone: 'UTC',
    content: {
      herbs: { all: HERBS, byId: new Map(HERBS.map((h) => [h.id, h])) },
      combinations: { all: FORMULAS, byId: new Map(FORMULAS.map((f) => [f.id, f])) },
    },
  } as unknown as BotDeps;
}

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

describe('listView (Plan 024)', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  it('renders rows as rem:open:<id> open buttons with no per-row delete', () => {
    const userId = ensureUser('1', 'u');
    const id = createReminder({
      userId,
      label: 'Пить воду',
      recurrence: { kind: 'daily', times: ['08:00'] },
      nextFireAt: 1_000,
    });
    const btns = buttons(listView(userId, depsStub()));
    expect(btns.find((b) => b.text === 'Пить воду')?.callback_data).toBe(`rem:open:${id}`);
    expect(btns.some((b) => b.callback_data?.startsWith('rem:cancel'))).toBe(false);
    expect(btns.some((b) => b.callback_data === 'rc:new')).toBe(true);
  });

  it('shows the empty state with only the ➕ Новое row when there are none', () => {
    const userId = ensureUser('2', 'u');
    const btns = buttons(listView(userId, depsStub()));
    expect(btns).toHaveLength(1);
    expect(btns[0]?.callback_data).toBe('rc:new');
  });

  it('surfaces the linked formula on the row (not just the detail screen)', () => {
    const userId = ensureUser('3', 'u');
    createReminder({
      userId,
      label: 'Агар-8',
      combinationId: 'tib-formula-agar-8',
      intakeType: 'decoction',
      recurrence: { kind: 'daily', times: ['08:00'] },
      nextFireAt: 1_000,
    });
    const view = listView(userId, depsStub());
    expect(view.text).toContain('🧪 Состав: Агар-8');
    // Intake stays on the detail screen to keep list rows compact.
    expect(view.text).not.toContain('🍶 Приём');
  });

  it('surfaces the linked ingredient on the row', () => {
    const userId = ensureUser('4', 'u');
    createReminder({
      userId,
      label: 'Имбирь',
      herbId: 'tib-ginger',
      recurrence: { kind: 'daily', times: ['08:00'] },
      nextFireAt: 1_000,
    });
    const view = listView(userId, depsStub());
    expect(view.text).toContain('🌿 Ингредиент: Имбирь');
  });
});

// Regression (Plan 025): the reminders list must render "Ближайшее" in the
// user's own effective zone, not the bot-global fallback. Here the fallback is
// Europe/Moscow (UTC+3) while the user runs on Europe/Belgrade (UTC+2); a
// nextFireAt of 15:30 UTC must therefore surface as 17:30 (Belgrade), not 18:30
// (Moscow). Before the fix, `remindersEntry` passed `deps.timezone` straight
// through, so the line showed the fallback zone.
describe('remindersEntry: per-user timezone (Plan 025)', () => {
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  it('renders the next-fire line in the user timezone, not the global fallback', async () => {
    const userId = ensureUser('1', 'u');
    setSetting(userId, SETTING_TIMEZONE, 'Europe/Belgrade');
    createReminder({
      userId,
      label: 'Пить воду',
      // Recurrence wall-clock is unrelated to the fire instant on purpose, so the
      // only source of "17:30" in the output is the zone-formatted nextFireAt.
      recurrence: { kind: 'daily', times: ['09:00'] },
      nextFireAt: Date.UTC(2026, 6, 1, 15, 30),
    });

    const deps = { timezone: 'Europe/Moscow' } as unknown as BotDeps;
    let replied: string | undefined;
    const ctx = {
      state: { userId },
      reply: (text: string) => {
        replied = text;
        return Promise.resolve(true);
      },
    } as unknown as Context;

    await remindersEntry(ctx, deps);

    expect(replied).toContain('17:30'); // Belgrade
    expect(replied).not.toContain('18:30'); // Moscow (the buggy fallback)
  });
});

describe('detailView (Plan 024)', () => {
  // detailView resolves the owner's timezone (Plan 025), which reads the DB.
  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  it('renders a formula reminder schedule + formula + intake with delete/back', () => {
    const view = detailView(
      reminder({ combinationId: 'tib-formula-agar-8', intakeType: 'decoction' }),
      depsStub(),
    );
    expect(view.text).toContain('🧪 Состав: Агар-8');
    expect(view.text).toContain('🍶 Приём: отвар');
    const btns = buttons(view);
    expect(btns.find((b) => b.text === '🗑 Удалить')?.callback_data).toBe('rem:del:1');
    expect(btns.some((b) => b.callback_data === 'rem:list')).toBe(true);
  });

  it('renders a herb reminder with the ingredient line and no intake', () => {
    const view = detailView(reminder({ herbId: 'tib-ginger' }), depsStub());
    expect(view.text).toContain('🌿 Ингредиент: Имбирь');
    expect(view.text).not.toContain('🍶 Приём');
  });
});

describe('rem:del handler (Plan 024)', () => {
  type Handler = (ctx: Context) => Promise<unknown>;

  beforeEach(() => setupTestDb());
  afterEach(() => teardownTestDb());

  function captureActions(): Map<string, Handler> {
    const actions = new Map<string, Handler>();
    const stub = {
      command: () => undefined,
      action: (m: RegExp, h: Handler) => actions.set(m.source, h),
    } as unknown as Telegraf;
    registerRemindersCommand(stub, depsStub());
    return actions;
  }

  it('deactivates the reminder and re-renders the list', async () => {
    const userId = ensureUser('1', 'u');
    const id = createReminder({
      userId,
      label: 'Пить воду',
      recurrence: { kind: 'daily', times: ['08:00'] },
      nextFireAt: 1_000,
    });
    let edited: string | undefined;
    const ctx = {
      state: { userId },
      match: [`rem:del:${id}`, String(id)],
      answerCbQuery: () => Promise.resolve(true),
      editMessageText: (text: string) => {
        edited = text;
        return Promise.resolve(true);
      },
    } as unknown as Context;

    await captureActions().get('^rem:del:(\\d+)$')!(ctx);

    expect(listUserReminders(userId).every((r) => !r.active)).toBe(true);
    // Re-rendered into the now-empty list.
    expect(edited).toBe('У вас пока нет напоминаний. Создайте первое.');
  });
});
