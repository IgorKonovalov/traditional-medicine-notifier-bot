import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Telegraf, type Context } from 'telegraf';

import { createReminder, listUserReminders } from '../../db/repositories/reminder.repo';
import { ensureUser } from '../../db/repositories/user.repo';
import { setupTestDb, teardownTestDb } from '../../db/test-helper';
import type { ScheduledReminder } from '../../notifications/types';
import type { BotDeps } from '../context';
import { detailView, listView, registerRemindersCommand } from './reminders';

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
    const btns = buttons(listView(userId, 'UTC'));
    expect(btns.find((b) => b.text === 'Пить воду')?.callback_data).toBe(`rem:open:${id}`);
    expect(btns.some((b) => b.callback_data?.startsWith('rem:cancel'))).toBe(false);
    expect(btns.some((b) => b.callback_data === 'rc:new')).toBe(true);
  });

  it('shows the empty state with only the ➕ Новое row when there are none', () => {
    const userId = ensureUser('2', 'u');
    const btns = buttons(listView(userId, 'UTC'));
    expect(btns).toHaveLength(1);
    expect(btns[0]?.callback_data).toBe('rc:new');
  });
});

describe('detailView (Plan 024)', () => {
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
