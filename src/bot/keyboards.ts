/**
 * Shared inline keyboard builders.
 *
 * **Callback-data convention (ADR 009):** `<scope>:<action>:<arg?>`, e.g.
 * `herb:open:dang-gui`, `lib:page:2`, `nav:back`. Telegram caps `callback_data`
 * at **64 bytes** — use stable content `id`s and indices, never titles. Run
 * every payload through `assertCallbackData` so an over-budget id fails loud at
 * build time instead of silently dropping the button at runtime.
 */

import { Markup } from 'telegraf';

import type { Tradition } from '../content/types';
import { messages } from './messages';

type CallbackButton = ReturnType<typeof Markup.button.callback>;

/** Telegram's hard limit on `callback_data` length, in bytes. */
const CALLBACK_DATA_LIMIT = 64;

/**
 * Guard a `callback_data` payload against Telegram's 64-byte limit. Returns the
 * payload unchanged on success so it composes inline:
 * `Markup.button.callback(label, assertCallbackData('lib:open:' + id))`.
 */
export function assertCallbackData(data: string): string {
  const bytes = Buffer.byteLength(data, 'utf8');
  if (bytes > CALLBACK_DATA_LIMIT) {
    throw new Error(
      `callback_data exceeds Telegram's ${CALLBACK_DATA_LIMIT}-byte limit (${bytes} bytes): ${JSON.stringify(data)}`,
    );
  }
  return data;
}

/**
 * Persistent main-menu labels (ADR 009). Sourced from `messages.ts` so all
 * Russian copy stays in one place; re-exported here as the canonical handle the
 * menu router and keyboard builder share.
 */
export const MENU = messages.menu;

/**
 * Exact-match trigger for `bot.hears`. Reply-keyboard taps arrive as plain text
 * equal to the button label, so menu routing must match the whole string (not a
 * substring) to avoid colliding with a user typing the word mid-sentence.
 * Returns a one-element match array on hit so it slots into Telegraf's trigger
 * contract, `null` otherwise.
 */
export function exact(label: string): (value: string) => RegExpExecArray | null {
  return (value) => (value === label ? ([value] as unknown as RegExpExecArray) : null);
}

/**
 * The always-visible reply keyboard. `resize` keeps the buttons compact;
 * `persistent` keeps it open instead of collapsing to the keyboard icon.
 */
export function mainMenuKeyboard(): ReturnType<typeof Markup.keyboard> {
  return Markup.keyboard([[MENU.library, MENU.reminders], [MENU.tips, MENU.settings], [MENU.help]])
    .resize()
    .persistent();
}

/** A single-button row returning to the previous screen (`« Назад`). */
export function backRow(callbackData: string): CallbackButton[] {
  return [Markup.button.callback(messages.nav.back, assertCallbackData(callbackData))];
}

/** A single-button row jumping to a section root / main menu (`🏠 В меню`). */
export function homeRow(callbackData: string): CallbackButton[] {
  return [Markup.button.callback(messages.nav.home, assertCallbackData(callbackData))];
}

/**
 * A pager row: `◀  3 / 7  ▶`. `prefix` is the `<scope>:<action>` the page
 * buttons carry (`<prefix>:<index>`); the indicator and the edge buttons point
 * at `<prefix>:noop` so the pager never wraps past the first or last page —
 * tapping an edge is a silent no-op the handler ignores.
 */
export function pager(prefix: string, index: number, count: number): CallbackButton[] {
  const noop = `${prefix}:noop`;
  const prev = index > 0 ? `${prefix}:${index - 1}` : noop;
  const next = index < count - 1 ? `${prefix}:${index + 1}` : noop;
  return [
    Markup.button.callback(messages.nav.prev, assertCallbackData(prev)),
    Markup.button.callback(messages.nav.position(index, count), assertCallbackData(noop)),
    Markup.button.callback(messages.nav.next, assertCallbackData(next)),
  ];
}

/** Display label for a tradition. */
export function tradition(value: Tradition): string {
  return value === 'chinese' ? messages.browse.chinese : messages.browse.tibetan;
}
