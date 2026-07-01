/**
 * Create-reminder wizard (Plan 008) — the headline solicited-reminder feature,
 * wired onto the navigation shell (ADR 009). A single anchor message is edited
 * per step; the draft lives in a `reminder-create` session keyed by internal
 * `user_id`.
 *
 * This module is the Telegraf registrar + entry point + text capture, and the
 * package barrel. The pure domain core (`draft`), the step graph (`steps`), the
 * screen views (`views`/`time-view`/`link-view`/`view-kit`), the human-readable
 * summary (`describe`), and the fired-reminder payload (`message`) live in
 * siblings (Plan 029 split).
 */

import { type Context, type Telegraf } from 'telegraf';

import { createReminder } from '../../../db/repositories/reminder.repo';
import { getUserTimezone } from '../../../db/repositories/user.repo';
import type { IntakeType } from '../../../notifications/types';
import { formatDateTime } from '../../../utils/datetime';
import type { BotDeps } from '../../context';
import { getUserId } from '../../context';
import { messages } from '../../messages';
import { type Anchor, editAnchor, editAnchorAt, sendAnchor } from '../../render/anchor';
import {
  type AnchoredSession,
  deleteSession,
  loadSession,
  saveSession,
  SESSION_TTL_MS,
} from '../../session-store';
import { requireSessionAndAnchor } from '../_callback-prologue';
import {
  type DraftError,
  draftToRecurrence,
  emptyDraft,
  firstFireAt,
  LABEL_MAX,
  type RecurrenceKind,
  type ReminderDraft,
  type ReminderStep,
  validateDraft,
} from './draft';
import { nextStep, prevStep } from './steps';
import { view } from './views';

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
  const out = view(draft, deps, Date.now(), getUserTimezone(userId, deps.timezone));
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
  /** The reminder owner's effective timezone (Plan 025), per handler. */
  const tzOf = (userId: number): string => getUserTimezone(userId, deps.timezone);

  /** Re-render the current step into the anchor and persist the draft. */
  const editAndPersist = async (
    ctx: Context,
    v: { userId: number; session: AnchoredSession<ReminderDraft> },
    draft: ReminderDraft,
  ): Promise<void> => {
    const out = view(draft, deps, Date.now(), tzOf(v.userId));
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
    // A reminder carries a single time (all kinds): a tap replaces any prior
    // selection but does NOT advance — the user confirms with «Далее». The slot
    // is built from the tapped hour + the authoritative server-side minute mode
    // — never the callback — so a stale `:00` keyboard tapped after the user
    // switched to `:30` still commits `HH:30` (Plan 024 `.30` fix).
    draft.times = [`${ctx.match[1] ?? ''}:${draft.minuteMode ?? '00'}`];
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
      if (draft.times.length === 0) {
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
    const tz = tzOf(v.userId);
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
    const tz = getUserTimezone(userId, deps.timezone);
    if (raw.length > LABEL_MAX) {
      draft.customLabel = true;
      delete draft.label;
      const out = view(draft, deps, Date.now(), tz);
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
    const out = view(draft, deps, Date.now(), tz);
    await editAnchorAt(ctx, session.anchor.messageId, out.text, out.keyboard);
    persist(userId, session.anchor, draft);
  });
}

// ─── consumer/test re-exports (Plan 029 split kept the same import surface) ──────

export type { ReminderDraft } from './draft';
export { draftToRecurrence, firstFireAt, normalizeTimes, validateDraft } from './draft';
export { describeReminder } from './describe';
export { buildReminderMessage, intakeLabel } from './message';
export { stepsFor } from './steps';
export { timeView } from './time-view';
export { formulaPickerView, herbPageSlice } from './link-view';
export { view } from './views';
