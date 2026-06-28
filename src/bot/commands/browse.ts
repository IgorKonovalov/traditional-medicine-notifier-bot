/**
 * /browse — anchor-edit drilldown (ADR 009): tradition picker → herb list →
 * herb card, all editing **one** message. The session (kind `browse`) remembers
 * the current tradition + list page so `« Назад` returns to the exact screen the
 * user came from and never dead-ends. Long lists paginate via the shared pager.
 *
 * Callback scope `br:` — `br:tr:<t>`, `br:list:<page>`, `br:herb:<id>`,
 * `br:back`, `br:home`. The notification "Открыть" CTA enters here via
 * `openHerbAnchor`, which opens a fresh anchored card (its back lands on the
 * picker).
 */

import { Markup, type Context, type Telegraf } from 'telegraf';

import type { Tradition } from '../../content/types';
import type { BotDeps } from '../context';
import { getUserId } from '../context';
import { assertCallbackData, backRow, homeRow, pager } from '../keyboards';
import { messages } from '../messages';
import { type Anchor, editAnchor, sendAnchor } from '../render/anchor';
import { type AnchoredSession, deleteSession, saveSession, SESSION_TTL_MS } from '../session-store';
import { requireSessionAndAnchor } from './_callback-prologue';
import { herbCardKeyboard, renderHerb } from './_herb-card';

const PAGE_SIZE = 8;

/** Where the user is inside the browse drilldown. Screen = which fields are set. */
interface BrowseState {
  /** Set once a tradition is picked (list/herb screens). */
  readonly tradition?: Tradition;
  /** Current list page. */
  readonly page: number;
  /** Set while a herb card is open. */
  readonly herbId?: string;
}

interface View {
  readonly text: string;
  readonly keyboard: ReturnType<typeof Markup.inlineKeyboard>;
}

function persist(userId: number, anchor: Anchor, state: BrowseState): void {
  const session: AnchoredSession<BrowseState> = { anchor, state };
  saveSession(userId, 'browse', session, SESSION_TTL_MS);
}

function pickerView(): View {
  return {
    text: messages.browse.title,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback(messages.browse.chinese, 'br:tr:chinese')],
      [Markup.button.callback(messages.browse.tibetan, 'br:tr:tibetan')],
    ]),
  };
}

/** Render a list page, clamping `page` into range; returns the effective page. */
function listView(
  deps: BotDeps,
  tradition: Tradition,
  page: number,
): View & { readonly page: number } {
  const herbs = deps.content.herbs.all.filter((h) => h.tradition === tradition);
  if (herbs.length === 0) {
    return {
      text: messages.browse.empty,
      keyboard: Markup.inlineKeyboard([backRow('br:back')]),
      page: 0,
    };
  }
  const pageCount = Math.ceil(herbs.length / PAGE_SIZE);
  const safePage = Math.min(Math.max(page, 0), pageCount - 1);
  const slice = herbs.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const rows = slice.map((h) => [
    Markup.button.callback(h.nameRu, assertCallbackData(`br:herb:${h.id}`)),
  ]);
  const nav: ReturnType<typeof Markup.button.callback>[][] = [];
  if (pageCount > 1) nav.push(pager('br:list', safePage, pageCount));
  nav.push(backRow('br:back'));
  return {
    text: messages.browse.title,
    keyboard: Markup.inlineKeyboard([...rows, ...nav]),
    page: safePage,
  };
}

/** Render a herb card with browse navigation, or null if the herb id is unknown. */
function herbView(deps: BotDeps, herbId: string): View | null {
  const herb = deps.content.herbs.byId.get(herbId);
  if (herb === undefined) return null;
  return {
    text: renderHerb(herb),
    keyboard: herbCardKeyboard(herbId, [backRow('br:back'), homeRow('br:home')]),
  };
}

/** Open the browse picker as a fresh anchored session. Shared by /browse + menu. */
export async function browseEntry(ctx: Context): Promise<void> {
  const userId = getUserId(ctx);
  if (userId === undefined) {
    await ctx.reply(messages.common.notRegistered);
    return;
  }
  deleteSession(userId, 'browse');
  const view = pickerView();
  const anchor = await sendAnchor(ctx, view.text, view.keyboard);
  persist(userId, anchor, { page: 0 });
}

/**
 * Open a herb card as a fresh anchored browse session — the entry the
 * notification "Открыть" CTA uses. Back lands on the picker (no list context).
 */
export async function openHerbAnchor(ctx: Context, deps: BotDeps, herbId: string): Promise<void> {
  const userId = getUserId(ctx);
  if (userId === undefined) {
    await ctx.reply(messages.common.notRegistered);
    return;
  }
  const view = herbView(deps, herbId);
  if (view === null) {
    await ctx.reply(messages.common.sessionExpired);
    return;
  }
  deleteSession(userId, 'browse');
  const anchor = await sendAnchor(ctx, view.text, view.keyboard);
  persist(userId, anchor, { page: 0, herbId });
}

export function registerBrowseCommand(bot: Telegraf, deps: BotDeps): void {
  bot.command('browse', browseEntry);

  bot.action(/^br:tr:(chinese|tibetan)$/, async (ctx) => {
    const v = await requireSessionAndAnchor<BrowseState>(ctx, 'browse');
    if (v === null) return;
    await ctx.answerCbQuery();
    const tradition = ctx.match[1] as Tradition;
    const list = listView(deps, tradition, 0);
    await editAnchor(ctx, list.text, list.keyboard);
    persist(v.userId, v.session.anchor, { tradition, page: list.page });
  });

  bot.action(/^br:list:(\d+)$/, async (ctx) => {
    const v = await requireSessionAndAnchor<BrowseState>(ctx, 'browse');
    if (v === null) return;
    await ctx.answerCbQuery();
    const tradition = v.session.state.tradition;
    if (tradition === undefined) return;
    const list = listView(deps, tradition, Number(ctx.match[1] ?? '0'));
    await editAnchor(ctx, list.text, list.keyboard);
    persist(v.userId, v.session.anchor, { tradition, page: list.page });
  });

  bot.action(/^br:list:noop$/, (ctx) => ctx.answerCbQuery());

  bot.action(/^br:herb:(.+)$/, async (ctx) => {
    const v = await requireSessionAndAnchor<BrowseState>(ctx, 'browse');
    if (v === null) return;
    await ctx.answerCbQuery();
    const herbId = ctx.match[1] ?? '';
    const view = herbView(deps, herbId);
    if (view === null) return;
    await editAnchor(ctx, view.text, view.keyboard);
    const { tradition, page } = v.session.state;
    persist(v.userId, v.session.anchor, {
      ...(tradition !== undefined ? { tradition } : {}),
      page,
      herbId,
    });
  });

  bot.action(/^br:back$/, async (ctx) => {
    const v = await requireSessionAndAnchor<BrowseState>(ctx, 'browse');
    if (v === null) return;
    await ctx.answerCbQuery();
    const { tradition, page, herbId } = v.session.state;
    if (herbId !== undefined && tradition !== undefined) {
      // herb → its originating list
      const list = listView(deps, tradition, page);
      await editAnchor(ctx, list.text, list.keyboard);
      persist(v.userId, v.session.anchor, { tradition, page: list.page });
    } else {
      // herb-without-list or list → picker root
      const view = pickerView();
      await editAnchor(ctx, view.text, view.keyboard);
      persist(v.userId, v.session.anchor, { page: 0 });
    }
  });

  bot.action(/^br:home$/, async (ctx) => {
    const v = await requireSessionAndAnchor<BrowseState>(ctx, 'browse');
    if (v === null) return;
    await ctx.answerCbQuery();
    const view = pickerView();
    await editAnchor(ctx, view.text, view.keyboard);
    persist(v.userId, v.session.anchor, { page: 0 });
  });
}
