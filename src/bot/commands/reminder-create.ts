/**
 * Create-reminder wizard (Plan 008) — the headline solicited-reminder feature,
 * wired onto the navigation shell (ADR 009). A single anchor message is edited
 * per step; the draft lives in a `reminder-create` session keyed by internal
 * `user_id`.
 *
 * This top half is the **pure** core: the `ReminderDraft` shape plus the mappers
 * that turn a finished draft into a `RecurrenceSpec` and its first fire instant.
 * It delegates all recurrence math to `notifications/recurrence` — no offsets are
 * hand-rolled here (ADR 003 keeps the math pure and tz-correct). The Telegraf
 * wizard that drives these is the lower half of the file.
 */

import { Markup, type Context, type Telegraf } from 'telegraf';

import { createReminder } from '../../db/repositories/reminder.repo';
import {
  addDays,
  computeNextFire,
  formatLocalDate,
  zonedWallTimeToEpoch,
} from '../../notifications/recurrence';
import type { RecurrenceSpec } from '../../notifications/types';
import { formatDateTime, formatDayLabel } from '../../utils/datetime';
import type { BotDeps } from '../context';
import { getUserId } from '../context';
import { assertCallbackData } from '../keyboards';
import { messages } from '../messages';
import { type Anchor, editAnchor, editAnchorAt, sendAnchor } from '../render/anchor';
import {
  type AnchoredSession,
  deleteSession,
  loadSession,
  saveSession,
  SESSION_TTL_MS,
} from '../session-store';
import { requireSessionAndAnchor } from './_callback-prologue';

/** The recurrence kinds the wizard can build (mirrors `RecurrenceSpec`). */
export type RecurrenceKind = RecurrenceSpec['kind'];

/** Steps of the wizard, in nominal order; the active set depends on `kind`. */
export type ReminderStep = 'label' | 'kind' | 'every' | 'time' | 'date' | 'weekdays' | 'confirm';

/** Max label length — it is echoed back verbatim in every fired notification. */
export const LABEL_MAX = 100;

/**
 * In-flight wizard state, persisted as the `state` of an `AnchoredSession`.
 * Which fields matter depends on `kind`: `weekdays` (weekly), `everyDays`
 * (interval), `dateOffset` (once — days from today). `times` are local `HH:MM`.
 */
export interface ReminderDraft {
  step: ReminderStep;
  label?: string;
  /** Optional content herb this reminder links to. */
  herbId?: string;
  kind?: RecurrenceKind;
  /** Selected local `HH:MM` slots (deduped/sorted on use). */
  times: string[];
  /** Selected weekdays 0=Sun…6=Sat (weekly only). */
  weekdays: number[];
  /** Interval length in days (interval only). */
  everyDays?: number;
  /** Days from today for a one-shot (0=today, 1=tomorrow…). */
  dateOffset?: number;
  /** Set once the user opts out of a herb's default label, forcing free text. */
  customLabel?: boolean;
}

/** A fresh, empty draft. */
export function emptyDraft(): ReminderDraft {
  return { step: 'label', times: [], weekdays: [] };
}

/** Reason a draft cannot yet be saved, or `null` when it is valid. */
export type DraftError = 'label' | 'kind' | 'every' | 'time' | 'weekday' | 'past';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Deduped, validity-filtered, ascending list of the draft's selected times. */
export function normalizeTimes(times: readonly string[]): string[] {
  return [...new Set(times.filter((t) => TIME_RE.test(t)))].sort();
}

/**
 * Map a (validated) draft to the persisted `RecurrenceSpec`. A `once` reminder
 * carries no time/date in its spec — those are baked into `next_fire_at` via
 * {@link firstFireAt} and the spec is the bare `{ kind: 'once' }` sentinel.
 */
export function draftToRecurrence(draft: ReminderDraft): RecurrenceSpec {
  const times = normalizeTimes(draft.times);
  switch (draft.kind) {
    case 'daily':
      return { kind: 'daily', times };
    case 'weekly':
      return { kind: 'weekly', weekdays: [...draft.weekdays].sort((a, b) => a - b), times };
    case 'interval':
      return { kind: 'interval', everyDays: draft.everyDays ?? 1, times };
    case 'once':
    default:
      return { kind: 'once' };
  }
}

/**
 * First fire instant (epoch-ms) for a draft at `now`, or `null` when it has no
 * valid future slot (a `once` reminder whose chosen day+time already passed).
 *
 * Recurring kinds delegate to `computeNextFire`; `once` resolves the chosen
 * local day+time to an epoch via the same pure helpers and rejects the past.
 */
export function firstFireAt(draft: ReminderDraft, now: number, timeZone: string): number | null {
  const times = normalizeTimes(draft.times);
  if (draft.kind === 'once') {
    const time = times[0];
    if (time === undefined) return null;
    const date = addDays(formatLocalDate(now, timeZone), draft.dateOffset ?? 0);
    const epoch = zonedWallTimeToEpoch(date, time, timeZone);
    return epoch > now ? epoch : null;
  }
  return computeNextFire(draftToRecurrence(draft), now, timeZone);
}

/**
 * Gate a draft before persistence. Returns the first failing requirement (so the
 * wizard can keep the user on the relevant step) or `null` when it is ready.
 */
export function validateDraft(
  draft: ReminderDraft,
  now: number,
  timeZone: string,
): DraftError | null {
  if (draft.label === undefined || draft.label.trim() === '' || draft.label.length > LABEL_MAX) {
    return 'label';
  }
  if (draft.kind === undefined) return 'kind';
  if (draft.kind === 'interval' && !(draft.everyDays !== undefined && draft.everyDays >= 1)) {
    return 'every';
  }
  if (normalizeTimes(draft.times).length === 0) return 'time';
  if (draft.kind === 'weekly' && draft.weekdays.length === 0) return 'weekday';
  if (firstFireAt(draft, now, timeZone) === null) return 'past';
  return null;
}

// ─── human-readable recurrence (shared with the reminders list) ───────────────

const MON_FIRST = (wd: number): number => (wd + 6) % 7;

function weekdayName(wd: number): string {
  return messages.reminderCreate.weekdayShort[wd] ?? '';
}

function weekdaysList(weekdays: readonly number[]): string {
  return [...weekdays]
    .sort((a, b) => MON_FIRST(a) - MON_FIRST(b))
    .map(weekdayName)
    .join(', ');
}

/**
 * One-line Russian summary of a reminder's schedule. `once` reads its concrete
 * next-fire instant (the spec carries no time); recurring kinds read the spec.
 */
export function describeReminder(
  recurrence: RecurrenceSpec,
  nextFireAt: number,
  timeZone: string,
): string {
  const rc = messages.reminderCreate;
  switch (recurrence.kind) {
    case 'daily':
      return rc.describeDaily(recurrence.times.join(', '));
    case 'weekly':
      return rc.describeWeekly(weekdaysList(recurrence.weekdays), recurrence.times.join(', '));
    case 'interval':
      return rc.describeInterval(recurrence.everyDays, recurrence.times.join(', '));
    case 'once':
    default:
      return rc.describeOnce(formatDateTime(nextFireAt, timeZone));
  }
}

// ─── the wizard (anchor-edited steps) ─────────────────────────────────────────

type CallbackButton = ReturnType<typeof Markup.button.callback>;
type InlineKeyboard = ReturnType<typeof Markup.inlineKeyboard>;

interface View {
  readonly text: string;
  readonly keyboard: InlineKeyboard;
}

/** Time slots offered in the grid (local wall-clock). */
const TIME_SLOTS = ['07:00', '08:00', '09:00', '12:00', '18:00', '21:00'];
/** Interval lengths offered for the "каждые N дней" kind. */
const EVERY_OPTIONS = [2, 3, 5, 7, 10, 14, 30];
/** Day offsets offered for a one-shot's date picker (0=today … 6). */
const DATE_OFFSETS = [0, 1, 2, 3, 4, 5, 6];
/** Weekday buttons in Monday-first display order (values stay 0=Sun…6=Sat). */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const MS_PER_DAY = 86_400_000;

const timeCode = (t: string): string => t.replace(':', '');
const timeFromCode = (c: string): string => `${c.slice(0, 2)}:${c.slice(2)}`;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The step sequence for a given kind; drives next/prev and which steps exist. */
function stepsFor(kind: RecurrenceKind | undefined): ReminderStep[] {
  switch (kind) {
    case 'once':
      return ['label', 'kind', 'time', 'date', 'confirm'];
    case 'daily':
      return ['label', 'kind', 'time', 'confirm'];
    case 'weekly':
      return ['label', 'kind', 'time', 'weekdays', 'confirm'];
    case 'interval':
      return ['label', 'kind', 'every', 'time', 'confirm'];
    default:
      return ['label', 'kind'];
  }
}

function nextStep(draft: ReminderDraft): ReminderStep {
  const steps = stepsFor(draft.kind);
  const i = steps.indexOf(draft.step);
  return steps[Math.min(i + 1, steps.length - 1)] ?? draft.step;
}

function prevStep(draft: ReminderDraft): ReminderStep {
  const steps = stepsFor(draft.kind);
  const i = steps.indexOf(draft.step);
  return steps[Math.max(i - 1, 0)] ?? draft.step;
}

/** Trailing nav row: `« Назад` (when not on the first step) + `✖️ Отмена`. */
function navRow(showBack: boolean): CallbackButton[] {
  const row: CallbackButton[] = [];
  if (showBack) row.push(Markup.button.callback(messages.nav.back, 'rc:back'));
  row.push(Markup.button.callback(messages.reminderCreate.cancel, 'rc:cancel'));
  return row;
}

function labelView(draft: ReminderDraft): View {
  const rc = messages.reminderCreate;
  const herbMode = draft.herbId !== undefined && draft.customLabel !== true;
  if (herbMode && draft.label !== undefined) {
    return {
      text: rc.labelPromptHerb(draft.label),
      keyboard: Markup.inlineKeyboard([
        [Markup.button.callback(rc.useHerbName, 'rc:lbl:herb')],
        [Markup.button.callback(rc.enterCustom, 'rc:lbl:custom')],
        navRow(false),
      ]),
    };
  }
  const lines: string[] = [rc.labelPromptFree];
  const rows: CallbackButton[][] = [];
  if (draft.label !== undefined && draft.label.trim() !== '') {
    lines.push('', rc.labelCurrent(draft.label));
    rows.push([Markup.button.callback(rc.next, 'rc:next')]);
  }
  rows.push(navRow(false));
  return { text: lines.join('\n'), keyboard: Markup.inlineKeyboard(rows) };
}

/** Render the screen for the draft's current step. */
function view(draft: ReminderDraft, timeZone: string, now: number): View {
  const rc = messages.reminderCreate;
  switch (draft.step) {
    case 'label':
      return labelView(draft);
    case 'kind':
      return {
        text: rc.kindPrompt(draft.label ?? ''),
        keyboard: Markup.inlineKeyboard([
          [
            Markup.button.callback(rc.kindOnce, 'rc:kind:once'),
            Markup.button.callback(rc.kindDaily, 'rc:kind:daily'),
          ],
          [
            Markup.button.callback(rc.kindWeekly, 'rc:kind:weekly'),
            Markup.button.callback(rc.kindInterval, 'rc:kind:interval'),
          ],
          navRow(true),
        ]),
      };
    case 'every': {
      const btns = EVERY_OPTIONS.map((n) =>
        Markup.button.callback(rc.everyLabel(n), assertCallbackData(`rc:every:${n}`)),
      );
      return {
        text: rc.everyPrompt,
        keyboard: Markup.inlineKeyboard([...chunk(btns, 4), navRow(true)]),
      };
    }
    case 'time': {
      const selected = new Set(draft.times);
      const btns = TIME_SLOTS.map((t) =>
        Markup.button.callback(
          selected.has(t) ? `✓ ${t}` : t,
          assertCallbackData(`rc:time:${timeCode(t)}`),
        ),
      );
      const tail: CallbackButton[][] = [];
      if (draft.kind !== 'once') tail.push([Markup.button.callback(rc.next, 'rc:next')]);
      tail.push(navRow(true));
      return {
        text: draft.kind === 'once' ? rc.timePromptOnce : rc.timePrompt,
        keyboard: Markup.inlineKeyboard([...chunk(btns, 3), ...tail]),
      };
    }
    case 'date': {
      const btns = DATE_OFFSETS.map((off) => {
        const label =
          off === 0
            ? rc.dateToday
            : off === 1
              ? rc.dateTomorrow
              : formatDayLabel(now + off * MS_PER_DAY, timeZone);
        return Markup.button.callback(label, assertCallbackData(`rc:date:${off}`));
      });
      return {
        text: rc.datePrompt,
        keyboard: Markup.inlineKeyboard([...chunk(btns, 2), navRow(true)]),
      };
    }
    case 'weekdays': {
      const selected = new Set(draft.weekdays);
      const btns = WEEKDAY_ORDER.map((wd) =>
        Markup.button.callback(
          selected.has(wd) ? `✓ ${weekdayName(wd)}` : weekdayName(wd),
          assertCallbackData(`rc:wd:${wd}`),
        ),
      );
      return {
        text: rc.weekdaysPrompt,
        keyboard: Markup.inlineKeyboard([
          ...chunk(btns, 4),
          [Markup.button.callback(rc.next, 'rc:next')],
          navRow(true),
        ]),
      };
    }
    case 'confirm':
    default: {
      const at = firstFireAt(draft, now, timeZone);
      const recurrenceText =
        at === null
          ? rc.describeOnce('—')
          : describeReminder(draftToRecurrence(draft), at, timeZone);
      return {
        text: `${rc.confirmPrompt}\n\n${rc.summary(draft.label ?? '', recurrenceText, timeZone)}`,
        keyboard: Markup.inlineKeyboard([
          [Markup.button.callback(rc.save, 'rc:save')],
          navRow(true),
        ]),
      };
    }
  }
}

function persist(userId: number, anchor: Anchor, draft: ReminderDraft): void {
  const session: AnchoredSession<ReminderDraft> = { anchor, state: draft };
  saveSession(userId, 'reminder-create', session, SESSION_TTL_MS);
}

/**
 * Open the create wizard as a fresh anchored session. Shared by the reminders
 * list (`➕ Новое`) and the herb card (`⏰ Напомнить`, which pre-links the herb
 * and offers its name as the default label).
 */
export async function reminderCreateEntry(
  ctx: Context,
  deps: BotDeps,
  opts?: { herbId?: string; herbName?: string },
): Promise<void> {
  const userId = getUserId(ctx);
  if (userId === undefined) {
    await ctx.reply(messages.common.notRegistered);
    return;
  }
  deleteSession(userId, 'reminder-create');
  const draft = emptyDraft();
  if (opts?.herbId !== undefined) {
    draft.herbId = opts.herbId;
    if (opts.herbName !== undefined) draft.label = opts.herbName;
  }
  const out = view(draft, deps.timezone, Date.now());
  const anchor = await sendAnchor(ctx, out.text, out.keyboard);
  persist(userId, anchor, draft);
}

function errorToast(err: DraftError): string {
  const rc = messages.reminderCreate;
  switch (err) {
    case 'time':
      return rc.needTime;
    case 'weekday':
      return rc.needWeekday;
    case 'past':
      return rc.pastOnce;
    default:
      return messages.common.error;
  }
}

function errorStep(err: DraftError, draft: ReminderDraft): ReminderStep {
  switch (err) {
    case 'kind':
      return 'kind';
    case 'every':
      return 'every';
    case 'weekday':
      return 'weekdays';
    case 'past':
      return draft.kind === 'once' ? 'date' : 'time';
    case 'time':
      return 'time';
    case 'label':
    default:
      return 'label';
  }
}

export function registerReminderCreateCommand(bot: Telegraf, deps: BotDeps): void {
  const tz = deps.timezone;

  /** Re-render the current step into the anchor and persist the draft. */
  const editAndPersist = async (
    ctx: Context,
    v: { userId: number; session: AnchoredSession<ReminderDraft> },
    draft: ReminderDraft,
  ): Promise<void> => {
    const out = view(draft, tz, Date.now());
    await editAnchor(ctx, out.text, out.keyboard);
    persist(v.userId, v.session.anchor, draft);
  };

  // "➕ Новое" from the reminders list — a fresh wizard in a new anchor.
  bot.action(/^rc:new$/, async (ctx) => {
    await ctx.answerCbQuery();
    await reminderCreateEntry(ctx, deps);
  });

  bot.action(/^rc:lbl:herb$/, async (ctx) => {
    const v = await requireSessionAndAnchor<ReminderDraft>(ctx, 'reminder-create');
    if (v === null) return;
    await ctx.answerCbQuery();
    const draft = v.session.state;
    draft.step = nextStep(draft);
    await editAndPersist(ctx, v, draft);
  });

  bot.action(/^rc:lbl:custom$/, async (ctx) => {
    const v = await requireSessionAndAnchor<ReminderDraft>(ctx, 'reminder-create');
    if (v === null) return;
    await ctx.answerCbQuery();
    const draft = v.session.state;
    draft.customLabel = true;
    delete draft.label;
    draft.step = 'label';
    await editAndPersist(ctx, v, draft);
  });

  bot.action(/^rc:kind:(once|daily|weekly|interval)$/, async (ctx) => {
    const v = await requireSessionAndAnchor<ReminderDraft>(ctx, 'reminder-create');
    if (v === null) return;
    await ctx.answerCbQuery();
    const draft = v.session.state;
    draft.kind = ctx.match[1] as RecurrenceKind;
    draft.step = nextStep(draft);
    await editAndPersist(ctx, v, draft);
  });

  bot.action(/^rc:every:(\d+)$/, async (ctx) => {
    const v = await requireSessionAndAnchor<ReminderDraft>(ctx, 'reminder-create');
    if (v === null) return;
    await ctx.answerCbQuery();
    const draft = v.session.state;
    draft.everyDays = Number(ctx.match[1]);
    draft.step = nextStep(draft);
    await editAndPersist(ctx, v, draft);
  });

  bot.action(/^rc:time:(\d{4})$/, async (ctx) => {
    const v = await requireSessionAndAnchor<ReminderDraft>(ctx, 'reminder-create');
    if (v === null) return;
    await ctx.answerCbQuery();
    const draft = v.session.state;
    const t = timeFromCode(ctx.match[1] ?? '');
    if (draft.kind === 'once') {
      draft.times = [t];
      draft.step = nextStep(draft);
    } else {
      const set = new Set(draft.times);
      if (set.has(t)) set.delete(t);
      else set.add(t);
      draft.times = normalizeTimes([...set]);
    }
    await editAndPersist(ctx, v, draft);
  });

  bot.action(/^rc:date:(\d+)$/, async (ctx) => {
    const v = await requireSessionAndAnchor<ReminderDraft>(ctx, 'reminder-create');
    if (v === null) return;
    await ctx.answerCbQuery();
    const draft = v.session.state;
    draft.dateOffset = Number(ctx.match[1]);
    draft.step = nextStep(draft);
    await editAndPersist(ctx, v, draft);
  });

  bot.action(/^rc:wd:([0-6])$/, async (ctx) => {
    const v = await requireSessionAndAnchor<ReminderDraft>(ctx, 'reminder-create');
    if (v === null) return;
    await ctx.answerCbQuery();
    const draft = v.session.state;
    const wd = Number(ctx.match[1]);
    const set = new Set(draft.weekdays);
    if (set.has(wd)) set.delete(wd);
    else set.add(wd);
    draft.weekdays = [...set].sort((a, b) => a - b);
    await editAndPersist(ctx, v, draft);
  });

  bot.action(/^rc:next$/, async (ctx) => {
    const v = await requireSessionAndAnchor<ReminderDraft>(ctx, 'reminder-create');
    if (v === null) return;
    const draft = v.session.state;
    if (draft.step === 'label') {
      if (draft.label === undefined || draft.label.trim() === '') {
        await ctx.answerCbQuery();
        return;
      }
    } else if (draft.step === 'time') {
      if (normalizeTimes(draft.times).length === 0) {
        await ctx.answerCbQuery(messages.reminderCreate.needTime);
        return;
      }
    } else if (draft.step === 'weekdays') {
      if (draft.weekdays.length === 0) {
        await ctx.answerCbQuery(messages.reminderCreate.needWeekday);
        return;
      }
    } else {
      await ctx.answerCbQuery();
      return;
    }
    await ctx.answerCbQuery();
    draft.step = nextStep(draft);
    await editAndPersist(ctx, v, draft);
  });

  bot.action(/^rc:back$/, async (ctx) => {
    const v = await requireSessionAndAnchor<ReminderDraft>(ctx, 'reminder-create');
    if (v === null) return;
    await ctx.answerCbQuery();
    const draft = v.session.state;
    draft.step = prevStep(draft);
    await editAndPersist(ctx, v, draft);
  });

  bot.action(/^rc:save$/, async (ctx) => {
    const v = await requireSessionAndAnchor<ReminderDraft>(ctx, 'reminder-create');
    if (v === null) return;
    const draft = v.session.state;
    const now = Date.now();
    const err = validateDraft(draft, now, tz);
    if (err !== null) {
      await ctx.answerCbQuery(errorToast(err));
      draft.step = errorStep(err, draft);
      await editAndPersist(ctx, v, draft);
      return;
    }
    const fire = firstFireAt(draft, now, tz);
    if (fire === null) {
      await ctx.answerCbQuery(messages.reminderCreate.pastOnce);
      draft.step = errorStep('past', draft);
      await editAndPersist(ctx, v, draft);
      return;
    }
    createReminder(
      {
        userId: v.userId,
        label: (draft.label ?? '').trim(),
        herbId: draft.herbId ?? null,
        recurrence: draftToRecurrence(draft),
        nextFireAt: fire,
      },
      now,
    );
    deleteSession(v.userId, 'reminder-create');
    await ctx.answerCbQuery();
    await editAnchor(ctx, messages.reminderCreate.saved(formatDateTime(fire, tz)));
  });

  bot.action(/^rc:cancel$/, async (ctx) => {
    const v = await requireSessionAndAnchor<ReminderDraft>(ctx, 'reminder-create');
    if (v === null) return;
    deleteSession(v.userId, 'reminder-create');
    await ctx.answerCbQuery();
    await editAnchor(ctx, messages.reminderCreate.cancelled);
  });
}

/**
 * Free-text label capture. Registered **after** the menu router so a menu tap
 * (handled by `bot.hears`) wins; this only consumes a plain text message while a
 * create session is parked on the `label` step, and calls `next()` otherwise so
 * it never swallows unrelated messages (Plan 008 risk note).
 */
export function registerReminderCreateTextCapture(bot: Telegraf, deps: BotDeps): void {
  bot.on('text', async (ctx, next) => {
    const userId = getUserId(ctx);
    if (userId === undefined) {
      await next();
      return;
    }
    const session = loadSession<AnchoredSession<ReminderDraft>>(userId, 'reminder-create');
    if (session === null || session.state.step !== 'label') {
      await next();
      return;
    }
    const msg = ctx.message;
    const raw = msg !== undefined && 'text' in msg ? msg.text.trim() : '';
    if (raw === '') {
      await next();
      return;
    }
    const draft = session.state;
    if (raw.length > LABEL_MAX) {
      draft.customLabel = true;
      delete draft.label;
      const out = view(draft, deps.timezone, Date.now());
      await editAnchorAt(
        ctx,
        session.anchor.messageId,
        `${messages.reminderCreate.labelTooLong(LABEL_MAX)}\n\n${out.text}`,
        out.keyboard,
      );
      persist(userId, session.anchor, draft);
      return;
    }
    draft.label = raw;
    draft.step = nextStep(draft);
    const out = view(draft, deps.timezone, Date.now());
    await editAnchorAt(ctx, session.anchor.messageId, out.text, out.keyboard);
    persist(userId, session.anchor, draft);
  });
}
