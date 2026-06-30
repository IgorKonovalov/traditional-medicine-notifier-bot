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

import type { Combination, Herb } from '../../content/types';
import { createReminder } from '../../db/repositories/reminder.repo';
import {
  addDays,
  computeNextFire,
  formatLocalDate,
  zonedWallTimeToEpoch,
} from '../../notifications/recurrence';
import type { IntakeType, RecurrenceSpec, ScheduledReminder } from '../../notifications/types';
import type { NotificationPayload } from '../../services/notifier';
import { formatDateTime, formatDayLabel } from '../../utils/datetime';
import type { BotDeps } from '../context';
import { getUserId } from '../context';
import { assertCallbackData, pager } from '../keyboards';
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
export type ReminderStep =
  | 'label'
  | 'link'
  | 'intake'
  | 'kind'
  | 'every'
  | 'time'
  | 'date'
  | 'weekdays'
  | 'confirm';

/** Sub-screen of the `link` step: the type picker, or one of the two browsers. */
export type LinkView = 'choose' | 'herbs' | 'formulas';

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
  /** Optional content herb (ingredient) this reminder links to. */
  herbId?: string;
  /** Optional content formula (состав) this reminder links to. */
  combinationId?: string;
  /**
   * How a linked **formula** is taken (plan 024). Set only on the formula path;
   * the `intake` step is present only while `combinationId` is set.
   */
  intakeType?: IntakeType;
  /**
   * Active sub-screen of the `link` step: the `🌿 / 🧪 / ⏭` type picker
   * (`choose`, default) or one of the two browsers (`herbs` / `formulas`).
   */
  linkView?: LinkView;
  /**
   * Set when the herb was pre-linked at entry (herb-card `⏰ Напомнить` path).
   * Suppresses the in-wizard link + intake steps — the herb is already chosen.
   */
  herbPrelinked?: boolean;
  /** Current page of the herb picker (0-based). */
  herbPage?: number;
  /** Current page of the formula picker (0-based). */
  formulaPage?: number;
  kind?: RecurrenceKind;
  /**
   * Minute applied to an hour tap in the time grid: `:00` or `:30` (Plan 022).
   * Optional so in-flight sessions from before this field shipped keep working —
   * always read it through `?? '00'`.
   */
  minuteMode?: '00' | '30';
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
  return { step: 'label', times: [], weekdays: [], minuteMode: '00' };
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

/**
 * Inclusive hour range offered in the picker grid (local wall-clock). Single
 * tunable constants — widen to `0…23` for night-time reminders (Plan 022 Risks),
 * or change `HOUR_COLS` for a different grid width.
 */
const HOUR_START = 6;
const HOUR_END = 23;
const HOURS: readonly number[] = Array.from(
  { length: HOUR_END - HOUR_START + 1 },
  (_, i) => HOUR_START + i,
);
/** Hour buttons per grid row. */
const HOUR_COLS = 4;
/** Interval lengths offered for the "каждые N дней" kind. */
const EVERY_OPTIONS = [2, 3, 5, 7, 10, 14, 30];
/** Day offsets offered for a one-shot's date picker (0=today … 6). */
const DATE_OFFSETS = [0, 1, 2, 3, 4, 5, 6];
/** Weekday buttons in Monday-first display order (values stay 0=Sun…6=Sat). */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const MS_PER_DAY = 86_400_000;
/** Herbs shown per page of the optional herb-link picker. */
const HERBS_PER_PAGE = 8;

/**
 * Slice a list into a page, clamping `page` into `[0, pageCount)`. Pure and
 * order-preserving so the herb picker pages a stable corpus deterministically.
 */
export function herbPageSlice<T>(
  items: readonly T[],
  page: number,
  perPage: number = HERBS_PER_PAGE,
): { slice: readonly T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / perPage));
  const safePage = Math.min(Math.max(page, 0), pageCount - 1);
  const start = safePage * perPage;
  return { slice: items.slice(start, start + perPage), page: safePage, pageCount };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * The step sequence for a given kind; drives next/prev and which steps exist.
 *
 * The `link` step (type picker → ingredient/formula browser) sits between
 * `label` and `kind`, present only when the link was **not** pre-chosen at entry
 * (the herb-card path already linked a herb, so `herbPrelinked` skips both link
 * and intake). The `intake` step follows `link` **only when a formula is linked**
 * (`hasFormula`) — ingredient and free-text reminders carry no intake type.
 *
 * `nextStep`/`prevStep` recompute this from the live draft, so picking a formula
 * (which sets `combinationId`) inserts `intake`, and switching to an ingredient
 * or skipping (which clears it) drops it again.
 */
export function stepsFor(
  kind: RecurrenceKind | undefined,
  herbPrelinked: boolean,
  hasFormula: boolean,
): ReminderStep[] {
  const head: ReminderStep[] = herbPrelinked
    ? ['label', 'kind']
    : hasFormula
      ? ['label', 'link', 'intake', 'kind']
      : ['label', 'link', 'kind'];
  switch (kind) {
    case 'once':
      return [...head, 'time', 'date', 'confirm'];
    case 'daily':
      return [...head, 'time', 'confirm'];
    case 'weekly':
      return [...head, 'time', 'weekdays', 'confirm'];
    case 'interval':
      return [...head, 'every', 'time', 'confirm'];
    default:
      return head;
  }
}

function stepsForDraft(draft: ReminderDraft): ReminderStep[] {
  return stepsFor(draft.kind, draft.herbPrelinked === true, draft.combinationId !== undefined);
}

function nextStep(draft: ReminderDraft): ReminderStep {
  const steps = stepsForDraft(draft);
  const i = steps.indexOf(draft.step);
  return steps[Math.min(i + 1, steps.length - 1)] ?? draft.step;
}

function prevStep(draft: ReminderDraft): ReminderStep {
  const steps = stepsForDraft(draft);
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

/** Display name of an intake type — for the confirm / detail / notification lines. */
export function intakeLabel(type: IntakeType): string {
  const rc = messages.reminderCreate;
  return type === 'decoction' ? rc.intakeDecoctionLabel : rc.intakePlainLabel;
}

/**
 * Build the fired-reminder notification payload (the reminder-dispatch
 * `buildMessage`, plan 024). A formula reminder echoes its intake type in the
 * body and carries an `open-formula` CTA; a herb reminder carries `open-herb`;
 * a free-text reminder carries no CTA. A reminder links to a formula **or** a
 * herb, never both — formula takes precedence defensively. Pure (no IO), so the
 * dispatch contract is unit-testable without booting the app.
 */
export function buildReminderMessage(reminder: ScheduledReminder): NotificationPayload {
  if (reminder.combinationId !== null) {
    const lines = [messages.reminder.body(reminder.label)];
    if (reminder.intakeType !== null) {
      lines.push(messages.reminderCreate.intakeLine(intakeLabel(reminder.intakeType)));
    }
    return {
      body: lines.join('\n'),
      cta: { kind: 'open-formula', combinationId: reminder.combinationId },
    };
  }
  if (reminder.herbId !== null) {
    return {
      body: messages.reminder.body(reminder.label),
      cta: { kind: 'open-herb', herbId: reminder.herbId },
    };
  }
  return { body: messages.reminder.body(reminder.label) };
}

/** Sub-view back row for the link browsers: returns to the type picker, not prevStep. */
function linkBackRow(): CallbackButton[] {
  return [
    Markup.button.callback(messages.nav.back, 'rc:link:back'),
    Markup.button.callback(messages.reminderCreate.cancel, 'rc:cancel'),
  ];
}

/** The `link` type picker: 🌿 Ингредиент / 🧪 Состав / ⏭ Пропустить. Back → label. */
function linkChooseView(): View {
  const rc = messages.reminderCreate;
  return {
    text: rc.linkPrompt,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback(rc.linkHerb, 'rc:link:herbs')],
      [Markup.button.callback(rc.linkFormula, 'rc:link:formulas')],
      [Markup.button.callback(rc.herbSkip, 'rc:link:skip')],
      navRow(true),
    ]),
  };
}

/** The ingredient (herb) browser: a paginated list; back → the type picker. */
function herbPickerView(draft: ReminderDraft, herbs: readonly Herb[]): View {
  const rc = messages.reminderCreate;
  const { slice, page, pageCount } = herbPageSlice(herbs, draft.herbPage ?? 0);
  const rows: CallbackButton[][] = slice.map((h) => [
    Markup.button.callback(h.nameRu, assertCallbackData(`rc:herb:${h.id}`)),
  ]);
  if (pageCount > 1) rows.push(pager('rc:hpg', page, pageCount));
  rows.push(linkBackRow());
  return { text: rc.herbPrompt, keyboard: Markup.inlineKeyboard(rows) };
}

/** The formula (состав) browser: a paginated list; back → the type picker. */
export function formulaPickerView(draft: ReminderDraft, formulas: readonly Combination[]): View {
  const rc = messages.reminderCreate;
  const { slice, page, pageCount } = herbPageSlice(formulas, draft.formulaPage ?? 0);
  const rows: CallbackButton[][] = slice.map((f) => [
    Markup.button.callback(f.nameRu, assertCallbackData(`rc:formula:${f.id}`)),
  ]);
  if (pageCount > 1) rows.push(pager('rc:fpg', page, pageCount));
  rows.push(linkBackRow());
  return { text: rc.formulaPrompt, keyboard: Markup.inlineKeyboard(rows) };
}

/** Render the active `link` sub-screen (type picker, ingredient, or formula). */
function linkView(draft: ReminderDraft, deps: BotDeps): View {
  switch (draft.linkView ?? 'choose') {
    case 'herbs':
      return herbPickerView(draft, deps.content.herbs.all);
    case 'formulas':
      return formulaPickerView(draft, deps.content.combinations.all);
    case 'choose':
    default:
      return linkChooseView();
  }
}

/** The `intake` step (formula-only): plain warm water vs a decoction (отвар). */
function intakeView(): View {
  const rc = messages.reminderCreate;
  return {
    text: rc.intakePrompt,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback(rc.intakePlain, 'rc:intake:plain')],
      [Markup.button.callback(rc.intakeDecoction, 'rc:intake:decoction')],
      navRow(true),
    ]),
  };
}

/**
 * The `time` step: a `:00` / `:30` minute-mode toggle row above an hour grid
 * (Plan 022). The active mode (default `'00'`) sets the minute applied to an
 * hour tap; an hour is checkmarked when `HH:<mode>` is already selected, and the
 * full concrete set (across both modes) is listed under a `Выбрано:` line so no
 * selection is ever hidden by the per-mode checkmarks.
 */
export function timeView(draft: ReminderDraft): View {
  const rc = messages.reminderCreate;
  const mode = draft.minuteMode ?? '00';
  const selected = new Set(draft.times);
  const toggleRow: CallbackButton[] = [
    Markup.button.callback(mode === '00' ? `✓ ${rc.minute00}` : rc.minute00, 'rc:min:00'),
    Markup.button.callback(mode === '30' ? `✓ ${rc.minute30}` : rc.minute30, 'rc:min:30'),
  ];
  const hourBtns = HOURS.map((h) => {
    const hh = String(h).padStart(2, '0');
    // Carry only the hour in the callback; the commit handler combines it with
    // the authoritative server-side `draft.minuteMode` (Plan 024 `.30` fix). The
    // checkmark stays keyed on the per-mode concrete slot.
    return Markup.button.callback(
      selected.has(`${hh}:${mode}`) ? `✓ ${hh}` : hh,
      assertCallbackData(`rc:time:${hh}`),
    );
  });
  const tail: CallbackButton[][] = [];
  if (draft.kind !== 'once') tail.push([Markup.button.callback(rc.next, 'rc:next')]);
  tail.push(navRow(true));
  const lines: string[] = [draft.kind === 'once' ? rc.timePromptOnce : rc.timePrompt];
  const times = normalizeTimes(draft.times);
  if (times.length > 0) lines.push(rc.selectedTimes(times.join(', ')));
  return {
    text: lines.join('\n'),
    keyboard: Markup.inlineKeyboard([toggleRow, ...chunk(hourBtns, HOUR_COLS), ...tail]),
  };
}

/** Render the screen for the draft's current step. Exported for render tests. */
export function view(draft: ReminderDraft, deps: BotDeps, now: number): View {
  const rc = messages.reminderCreate;
  const timeZone = deps.timezone;
  switch (draft.step) {
    case 'label':
      return labelView(draft);
    case 'link':
      return linkView(draft, deps);
    case 'intake':
      return intakeView();
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
    case 'time':
      return timeView(draft);
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
      const summary = rc.summary(draft.label ?? '', recurrenceText, timeZone);
      const lines = [summary];
      if (draft.combinationId !== undefined) {
        const formulaName = deps.content.combinations.byId.get(draft.combinationId)?.nameRu;
        if (formulaName !== undefined) lines.push(rc.formulaLine(formulaName));
        if (draft.intakeType !== undefined)
          lines.push(rc.intakeLine(intakeLabel(draft.intakeType)));
      } else if (draft.herbId !== undefined) {
        const herbName = deps.content.herbs.byId.get(draft.herbId)?.nameRu;
        if (herbName !== undefined) lines.push(rc.herbLine(herbName));
      }
      const body = lines.join('\n');
      return {
        text: `${rc.confirmPrompt}\n\n${body}`,
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
    draft.herbPrelinked = true;
    if (opts.herbName !== undefined) draft.label = opts.herbName;
  }
  const out = view(draft, deps, Date.now());
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
    const out = view(draft, deps, Date.now());
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

  // ── link step: type picker (choose) → ingredient / formula browser ──────────

  // `rc:link:herbs|formulas` open a browser (stay on the `link` step, flip the
  // sub-view). `rc:link:skip` clears any link and advances to `kind`. `rc:link:back`
  // returns the browser to the type picker (two-level back, not prevStep).
  bot.action(/^rc:link:herbs$/, async (ctx) => {
    const v = await requireSessionAndAnchor<ReminderDraft>(ctx, 'reminder-create');
    if (v === null) return;
    await ctx.answerCbQuery();
    const draft = v.session.state;
    draft.linkView = 'herbs';
    await editAndPersist(ctx, v, draft);
  });

  bot.action(/^rc:link:formulas$/, async (ctx) => {
    const v = await requireSessionAndAnchor<ReminderDraft>(ctx, 'reminder-create');
    if (v === null) return;
    await ctx.answerCbQuery();
    const draft = v.session.state;
    draft.linkView = 'formulas';
    await editAndPersist(ctx, v, draft);
  });

  bot.action(/^rc:link:back$/, async (ctx) => {
    const v = await requireSessionAndAnchor<ReminderDraft>(ctx, 'reminder-create');
    if (v === null) return;
    await ctx.answerCbQuery();
    const draft = v.session.state;
    draft.linkView = 'choose';
    await editAndPersist(ctx, v, draft);
  });

  bot.action(/^rc:link:skip$/, async (ctx) => {
    const v = await requireSessionAndAnchor<ReminderDraft>(ctx, 'reminder-create');
    if (v === null) return;
    await ctx.answerCbQuery();
    const draft = v.session.state;
    delete draft.herbId;
    delete draft.combinationId;
    delete draft.intakeType;
    draft.step = nextStep(draft); // → kind (no formula ⇒ no intake step)
    await editAndPersist(ctx, v, draft);
  });

  // Picking an ingredient links it (clearing any formula + intake) and advances
  // to `kind`; picking a formula links it (clearing any herb) and advances to the
  // formula-only `intake` step. Both recompute the step graph from the live draft.
  bot.action(/^rc:herb:(.+)$/, async (ctx) => {
    const v = await requireSessionAndAnchor<ReminderDraft>(ctx, 'reminder-create');
    if (v === null) return;
    await ctx.answerCbQuery();
    const draft = v.session.state;
    const herbId = ctx.match[1] ?? '';
    if (!deps.content.herbs.byId.has(herbId)) return;
    draft.herbId = herbId;
    delete draft.combinationId;
    delete draft.intakeType;
    draft.step = nextStep(draft);
    await editAndPersist(ctx, v, draft);
  });

  bot.action(/^rc:formula:(.+)$/, async (ctx) => {
    const v = await requireSessionAndAnchor<ReminderDraft>(ctx, 'reminder-create');
    if (v === null) return;
    await ctx.answerCbQuery();
    const draft = v.session.state;
    const formulaId = ctx.match[1] ?? '';
    if (!deps.content.combinations.byId.has(formulaId)) return;
    draft.combinationId = formulaId;
    delete draft.herbId;
    draft.step = nextStep(draft); // → intake (formula sets hasFormula)
    await editAndPersist(ctx, v, draft);
  });

  bot.action(/^rc:hpg:(\d+)$/, async (ctx) => {
    const v = await requireSessionAndAnchor<ReminderDraft>(ctx, 'reminder-create');
    if (v === null) return;
    await ctx.answerCbQuery();
    const draft = v.session.state;
    draft.herbPage = Number(ctx.match[1]);
    await editAndPersist(ctx, v, draft);
  });

  bot.action(/^rc:hpg:noop$/, (ctx) => ctx.answerCbQuery());

  bot.action(/^rc:fpg:(\d+)$/, async (ctx) => {
    const v = await requireSessionAndAnchor<ReminderDraft>(ctx, 'reminder-create');
    if (v === null) return;
    await ctx.answerCbQuery();
    const draft = v.session.state;
    draft.formulaPage = Number(ctx.match[1]);
    await editAndPersist(ctx, v, draft);
  });

  bot.action(/^rc:fpg:noop$/, (ctx) => ctx.answerCbQuery());

  // Intake step (formula-only): records how the formula is taken, then → kind.
  bot.action(/^rc:intake:(plain|decoction)$/, async (ctx) => {
    const v = await requireSessionAndAnchor<ReminderDraft>(ctx, 'reminder-create');
    if (v === null) return;
    await ctx.answerCbQuery();
    const draft = v.session.state;
    draft.intakeType = ctx.match[1] as IntakeType;
    draft.step = nextStep(draft);
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

  // Minute-mode toggle (Plan 022): flips the minute applied to an hour tap and
  // re-renders the grid. Must NOT touch `step` or `times` — even for `once`,
  // only an hour tap commits a time and advances.
  bot.action(/^rc:min:(00|30)$/, async (ctx) => {
    const v = await requireSessionAndAnchor<ReminderDraft>(ctx, 'reminder-create');
    if (v === null) return;
    await ctx.answerCbQuery();
    const draft = v.session.state;
    draft.minuteMode = ctx.match[1] as '00' | '30';
    await editAndPersist(ctx, v, draft);
  });

  bot.action(/^rc:time:(\d{2})$/, async (ctx) => {
    const v = await requireSessionAndAnchor<ReminderDraft>(ctx, 'reminder-create');
    if (v === null) return;
    await ctx.answerCbQuery();
    const draft = v.session.state;
    // Build the slot from the tapped hour + the authoritative server-side minute
    // mode — never the callback — so a stale `:00` keyboard tapped after the user
    // switched to `:30` still commits `HH:30` (Plan 024 `.30` fix).
    const t = `${ctx.match[1] ?? ''}:${draft.minuteMode ?? '00'}`;
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
    // Re-entering the link step lands on the type picker, not a stale browser
    // sub-view; the chosen id is preserved so confirm/intake stay coherent.
    if (draft.step === 'link') draft.linkView = 'choose';
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
        combinationId: draft.combinationId ?? null,
        intakeType: draft.intakeType ?? null,
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
      const out = view(draft, deps, Date.now());
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
    const out = view(draft, deps, Date.now());
    await editAnchorAt(ctx, session.anchor.messageId, out.text, out.keyboard);
    persist(userId, session.anchor, draft);
  });
}
