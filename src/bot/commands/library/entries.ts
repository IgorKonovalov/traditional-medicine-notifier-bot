/**
 * Library entry points (Plan 029 split) — each opens a fresh anchored `library`
 * session and is reachable from both a slash command (wired in `index.ts`) and,
 * for `libraryEntry`, the persistent menu (`menu-router.ts`). The notification
 * "Открыть" CTAs (`openHerbCardAnchor`/`openFormulaCardAnchor`) open a card
 * directly as a fresh session.
 */

import { type Context } from 'telegraf';

import type { BotDeps } from '../../context';
import { getUserId } from '../../context';
import { messages } from '../../messages';
import { deleteSession } from '../../session-store';
import { viewFor } from './dispatch';
import { cardView, herbsMenuView } from './herbs';
import { formulaCardView } from './formulas';
import { hubView } from './hub';
import { type LibraryState, persist, sendView } from './state';

/** Open the library hub as a fresh anchored session. Menu + `/library`. */
export async function libraryEntry(ctx: Context): Promise<void> {
  const userId = getUserId(ctx);
  if (userId === undefined) {
    await ctx.reply(messages.common.notRegistered);
    return;
  }
  deleteSession(userId, 'library');
  const view = hubView();
  const anchor = await sendView(ctx, view);
  persist(userId, anchor, { screen: 'hub', page: 0 });
}

/** Open the 🌿 Травы sub-menu directly — the `/browse` shortcut lands here. */
export async function libraryHerbsEntry(ctx: Context): Promise<void> {
  const userId = getUserId(ctx);
  if (userId === undefined) {
    await ctx.reply(messages.common.notRegistered);
    return;
  }
  deleteSession(userId, 'library');
  const view = herbsMenuView();
  const anchor = await sendView(ctx, view);
  persist(userId, anchor, { screen: 'herbs', page: 0 });
}

/**
 * Open the 🔎 Поиск branch as a fresh library session. With a query (the
 * `/search <query>` shortcut) it lands straight on the results; without one it
 * shows the prompt and the text capture claims the next typed message.
 */
export async function librarySearchEntry(
  ctx: Context,
  deps: BotDeps,
  rawQuery?: string,
): Promise<void> {
  const userId = getUserId(ctx);
  if (userId === undefined) {
    await ctx.reply(messages.common.notRegistered);
    return;
  }
  deleteSession(userId, 'library');
  const query = (rawQuery ?? '').trim().toLowerCase();
  const state: LibraryState =
    query === '' ? { screen: 'search', page: 0 } : { screen: 'results', query, page: 0 };
  const out = viewFor(deps, state, userId);
  const anchor = await sendView(ctx, out);
  persist(userId, anchor, { ...state, page: out.page });
}

/** Open the 📖 Статьи guide list as a fresh library session. Menu + `/guides`. */
export async function libraryGuidesEntry(ctx: Context, deps: BotDeps): Promise<void> {
  const userId = getUserId(ctx);
  if (userId === undefined) {
    await ctx.reply(messages.common.notRegistered);
    return;
  }
  deleteSession(userId, 'library');
  const out = viewFor(deps, { screen: 'guide-list', page: 0 }, userId);
  const anchor = await sendView(ctx, out);
  persist(userId, anchor, { screen: 'guide-list', page: out.page });
}

/** Open the 🥗 Продукты groups screen as a fresh library session. Menu + `/foods`. */
export async function libraryFoodsEntry(ctx: Context, deps: BotDeps): Promise<void> {
  const userId = getUserId(ctx);
  if (userId === undefined) {
    await ctx.reply(messages.common.notRegistered);
    return;
  }
  deleteSession(userId, 'library');
  const out = viewFor(deps, { screen: 'food-groups', page: 0 }, userId);
  const anchor = await sendView(ctx, out);
  persist(userId, anchor, { screen: 'food-groups', page: out.page });
}

/**
 * Open a herb card as a fresh library session — the notification "Открыть" CTA.
 * Back lands on the hub (the card carries no list context).
 */
export async function openHerbCardAnchor(
  ctx: Context,
  deps: BotDeps,
  herbId: string,
): Promise<void> {
  const userId = getUserId(ctx);
  if (userId === undefined) {
    await ctx.reply(messages.common.notRegistered);
    return;
  }
  const view = cardView(deps, herbId);
  if (view === null) {
    await ctx.reply(messages.common.sessionExpired);
    return;
  }
  deleteSession(userId, 'library');
  const anchor = await sendView(ctx, view);
  persist(userId, anchor, { screen: 'card', page: 0, herbId });
}

/**
 * Open a formula card as a fresh library session — the formula-reminder "Открыть"
 * CTA (plan 024). Mirrors {@link openHerbCardAnchor}; back lands on the formula
 * list (the card carries no list context). Only ever reached while the formula
 * branch is live (`FORMULA_BRANCH_ENABLED`), as a formula CTA is only attached to
 * formula-linked reminders, which exist only once the branch is up.
 */
export async function openFormulaCardAnchor(
  ctx: Context,
  deps: BotDeps,
  formulaId: string,
): Promise<void> {
  const userId = getUserId(ctx);
  if (userId === undefined) {
    await ctx.reply(messages.common.notRegistered);
    return;
  }
  const view = formulaCardView(deps, formulaId);
  if (view === null) {
    await ctx.reply(messages.common.sessionExpired);
    return;
  }
  deleteSession(userId, 'library');
  const anchor = await sendView(ctx, view);
  persist(userId, anchor, { screen: 'formula-card', page: 0, formulaId });
}
