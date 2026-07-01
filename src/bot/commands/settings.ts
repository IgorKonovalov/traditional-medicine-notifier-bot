/**
 * ⚙️ Настройки — an anchor-edited settings hub (ADR 009) whose button labels
 * reflect current state (the daily-tip toggle reads вкл ✅ / выкл 🔕). Toggling
 * edits the anchor in place and re-renders with a `✓` confirmation line; the
 * other rows are entry points to existing surfaces (donate, feedback) which
 * open as their own messages.
 *
 * Callback scope `set:` — `set:tip:toggle`, `set:open:<surface>`, `set:close`.
 * Settings persist via the existing `user_settings` repo; the bot timezone is
 * shown read-only (per-user timezones are a later plan).
 */

import { Markup, type Context, type Telegraf } from 'telegraf';

import {
  getSetting,
  getUserTimezone,
  setSetting,
  SETTING_DAILY_TIP,
  SETTING_FEATURE_ANNOUNCEMENTS,
  SETTING_TIMEZONE,
} from '../../db/repositories/user.repo';
import { recomputeUserReminderFireTimes } from '../../services/reminder-timezone';
import type { BotDeps } from '../context';
import { getUserId } from '../context';
import { assertCallbackData, backRow } from '../keyboards';
import { messages } from '../messages';
import { editAnchor, sendAnchor } from '../render/anchor';
import { type AnchoredSession, deleteSession, saveSession, SESSION_TTL_MS } from '../session-store';
import { TIMEZONES, timezoneLabel } from '../timezones';
import { requireSessionAndAnchor } from './_callback-prologue';
import { donateEntry } from './donate';
import { feedbackEntry } from './feedback';

interface HubView {
  readonly text: string;
  readonly keyboard: ReturnType<typeof Markup.inlineKeyboard>;
}

/**
 * Render the hub. `timezone` is the user's effective IANA zone (its Russian
 * label is shown); `confirmation` prepends a `✓` line after a state change.
 */
function hubView(
  dailyTipOn: boolean,
  announcementsOn: boolean,
  timezone: string,
  confirmation?: string,
): HubView {
  const lines = [messages.settings.title, ''];
  if (confirmation !== undefined) lines.push(confirmation, '');
  lines.push(messages.settings.body, '', messages.settings.timezone(timezoneLabel(timezone)));
  return {
    text: lines.join('\n'),
    keyboard: Markup.inlineKeyboard([
      [
        Markup.button.callback(
          dailyTipOn ? messages.settings.tipLabelOn : messages.settings.tipLabelOff,
          'set:tip:toggle',
        ),
      ],
      [
        Markup.button.callback(
          announcementsOn
            ? messages.settings.announcementsLabelOn
            : messages.settings.announcementsLabelOff,
          'set:ann:toggle',
        ),
      ],
      [Markup.button.callback(messages.settings.timezoneButton, 'set:tz:open')],
      [
        Markup.button.callback(messages.settings.donateButton, 'set:open:donate'),
        Markup.button.callback(messages.settings.feedbackButton, 'set:open:feedback'),
      ],
      backRow('set:close'),
    ]),
  };
}

/** The timezone picker screen; marks the user's current zone with a `✓`. */
function timezonePickerView(currentZoneId: string): HubView {
  const rows = TIMEZONES.map((tz, i) => [
    Markup.button.callback(
      tz.id === currentZoneId ? `✓ ${tz.label}` : tz.label,
      assertCallbackData(`set:tz:${i}`),
    ),
  ]);
  return {
    text: messages.settings.timezonePrompt,
    keyboard: Markup.inlineKeyboard([...rows, backRow('set:tz:back')]),
  };
}

function dailyTipOn(userId: number): boolean {
  return getSetting(userId, SETTING_DAILY_TIP) === '1';
}

function announcementsOn(userId: number): boolean {
  return getSetting(userId, SETTING_FEATURE_ANNOUNCEMENTS) === '1';
}

function persist(userId: number, messageId: number): void {
  const session: AnchoredSession<Record<string, never>> = { anchor: { messageId }, state: {} };
  saveSession(userId, 'settings', session, SESSION_TTL_MS);
}

/** Open the settings hub as a fresh anchored session. Shared by /settings + menu. */
export async function settingsEntry(ctx: Context, deps: BotDeps): Promise<void> {
  const userId = getUserId(ctx);
  if (userId === undefined) {
    await ctx.reply(messages.common.notRegistered);
    return;
  }
  deleteSession(userId, 'settings');
  const view = hubView(
    dailyTipOn(userId),
    announcementsOn(userId),
    getUserTimezone(userId, deps.timezone),
  );
  const anchor = await sendAnchor(ctx, view.text, view.keyboard);
  persist(userId, anchor.messageId);
}

export function registerSettingsCommand(bot: Telegraf, deps: BotDeps): void {
  bot.command('settings', (ctx) => settingsEntry(ctx, deps));

  bot.action(/^set:tip:toggle$/, async (ctx) => {
    const v = await requireSessionAndAnchor(ctx, 'settings');
    if (v === null) return;
    const turnOn = !dailyTipOn(v.userId);
    setSetting(v.userId, SETTING_DAILY_TIP, turnOn ? '1' : '0');
    await ctx.answerCbQuery();
    const confirmation = turnOn ? messages.settings.confirmTipOn : messages.settings.confirmTipOff;
    const view = hubView(turnOn, announcementsOn(v.userId), deps.timezone, confirmation);
    await editAnchor(ctx, view.text, view.keyboard);
    persist(v.userId, v.session.anchor.messageId);
  });

  bot.action(/^set:ann:toggle$/, async (ctx) => {
    const v = await requireSessionAndAnchor(ctx, 'settings');
    if (v === null) return;
    const turnOn = !announcementsOn(v.userId);
    setSetting(v.userId, SETTING_FEATURE_ANNOUNCEMENTS, turnOn ? '1' : '0');
    await ctx.answerCbQuery();
    const confirmation = turnOn
      ? messages.settings.confirmAnnouncementsOn
      : messages.settings.confirmAnnouncementsOff;
    const view = hubView(dailyTipOn(v.userId), turnOn, deps.timezone, confirmation);
    await editAnchor(ctx, view.text, view.keyboard);
    persist(v.userId, v.session.anchor.messageId);
  });

  // ── Timezone picker (Plan 025) ───────────────────────────────────────────
  bot.action(/^set:tz:open$/, async (ctx) => {
    const v = await requireSessionAndAnchor(ctx, 'settings');
    if (v === null) return;
    await ctx.answerCbQuery();
    const view = timezonePickerView(getUserTimezone(v.userId, deps.timezone));
    await editAnchor(ctx, view.text, view.keyboard);
    persist(v.userId, v.session.anchor.messageId);
  });

  bot.action(/^set:tz:back$/, async (ctx) => {
    const v = await requireSessionAndAnchor(ctx, 'settings');
    if (v === null) return;
    await ctx.answerCbQuery();
    const view = hubView(
      dailyTipOn(v.userId),
      announcementsOn(v.userId),
      getUserTimezone(v.userId, deps.timezone),
    );
    await editAnchor(ctx, view.text, view.keyboard);
    persist(v.userId, v.session.anchor.messageId);
  });

  bot.action(/^set:tz:(\d+)$/, async (ctx) => {
    const v = await requireSessionAndAnchor(ctx, 'settings');
    if (v === null) return;
    const chosen = TIMEZONES[Number(ctx.match[1])];
    if (chosen === undefined) {
      await ctx.answerCbQuery();
      return;
    }
    setSetting(v.userId, SETTING_TIMEZONE, chosen.id);
    // Shift the user's active recurring reminders into the new zone so they keep
    // firing at the intended local time (one-shots are left as-is).
    recomputeUserReminderFireTimes(v.userId, chosen.id);
    await ctx.answerCbQuery();
    const view = hubView(
      dailyTipOn(v.userId),
      announcementsOn(v.userId),
      chosen.id,
      messages.settings.confirmTimezone(chosen.label),
    );
    await editAnchor(ctx, view.text, view.keyboard);
    persist(v.userId, v.session.anchor.messageId);
  });

  // Entry points to existing surfaces: dispose the hub session (so its now-stale
  // anchor no-ops) and open the surface as its own message.
  const openSurface = (open: (ctx: Context) => Promise<void>) => async (ctx: Context) => {
    const v = await requireSessionAndAnchor(ctx, 'settings');
    if (v === null) return;
    deleteSession(v.userId, 'settings');
    await ctx.answerCbQuery();
    await open(ctx);
  };

  bot.action(/^set:open:donate$/, openSurface(donateEntry));
  bot.action(/^set:open:feedback$/, openSurface(feedbackEntry));

  bot.action(/^set:close$/, async (ctx) => {
    const v = await requireSessionAndAnchor(ctx, 'settings');
    if (v === null) return;
    deleteSession(v.userId, 'settings');
    await ctx.answerCbQuery();
    await editAnchor(ctx, messages.settings.closed);
  });
}
