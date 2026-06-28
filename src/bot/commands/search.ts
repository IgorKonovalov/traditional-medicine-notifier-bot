/**
 * /search <query> — case-insensitive substring match over herb names (Russian,
 * Latin, original). Results render into an anchored, paginated list (ADR 009);
 * tapping a result edits the anchor into the herb card, and `« Назад` returns to
 * the results page the user came from.
 *
 * The session (kind `search`) stores the normalized query + page, so each
 * callback re-derives the (deterministic, in-memory) hit list rather than
 * persisting it. Callback scope `se:` — `se:list:<page>`, `se:herb:<id>`,
 * `se:back`.
 */

import { Markup, type Telegraf } from 'telegraf';

import type { Herb } from '../../content/types';
import type { BotDeps } from '../context';
import { getUserId } from '../context';
import { assertCallbackData, backRow, pager } from '../keyboards';
import { messages } from '../messages';
import { type Anchor, editAnchor, sendAnchor } from '../render/anchor';
import { type AnchoredSession, deleteSession, saveSession, SESSION_TTL_MS } from '../session-store';
import { requireSessionAndAnchor } from './_callback-prologue';
import { herbCardKeyboard, renderHerb } from './_herb-card';

const PAGE_SIZE = 8;

interface SearchState {
  /** Normalized (lowercased) query. */
  readonly query: string;
  readonly page: number;
  readonly herbId?: string;
}

interface View {
  readonly text: string;
  readonly keyboard: ReturnType<typeof Markup.inlineKeyboard>;
}

function matches(herb: Herb, q: string): boolean {
  const haystack = [herb.nameRu, herb.nameLatin, herb.nameOriginal]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

function findHits(deps: BotDeps, query: string): Herb[] {
  return deps.content.herbs.all.filter((h) => matches(h, query));
}

function persist(userId: number, anchor: Anchor, state: SearchState): void {
  const session: AnchoredSession<SearchState> = { anchor, state };
  saveSession(userId, 'search', session, SESSION_TTL_MS);
}

/** Render a results page, clamping `page` into range; returns the effective page. */
function resultsView(hits: readonly Herb[], page: number): View & { readonly page: number } {
  const pageCount = Math.max(1, Math.ceil(hits.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), pageCount - 1);
  const slice = hits.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const rows = slice.map((h) => [
    Markup.button.callback(h.nameRu, assertCallbackData(`se:herb:${h.id}`)),
  ]);
  const nav: ReturnType<typeof Markup.button.callback>[][] = [];
  if (pageCount > 1) nav.push(pager('se:list', safePage, pageCount));
  return {
    text: messages.search.results,
    keyboard: Markup.inlineKeyboard([...rows, ...nav]),
    page: safePage,
  };
}

function herbView(deps: BotDeps, herbId: string): View | null {
  const herb = deps.content.herbs.byId.get(herbId);
  if (herb === undefined) return null;
  return { text: renderHerb(herb), keyboard: herbCardKeyboard(herbId, [backRow('se:back')]) };
}

export function registerSearchCommand(bot: Telegraf, deps: BotDeps): void {
  bot.command('search', async (ctx) => {
    const userId = getUserId(ctx);
    if (userId === undefined) {
      await ctx.reply(messages.common.notRegistered);
      return;
    }
    const query = ctx.message.text
      .replace(/^\/search(@\w+)?\s*/i, '')
      .trim()
      .toLowerCase();
    if (query === '') {
      await ctx.reply(messages.search.prompt);
      return;
    }
    const hits = findHits(deps, query);
    if (hits.length === 0) {
      await ctx.reply(messages.search.nothingFound);
      return;
    }
    deleteSession(userId, 'search');
    const view = resultsView(hits, 0);
    const anchor = await sendAnchor(ctx, view.text, view.keyboard);
    persist(userId, anchor, { query, page: view.page });
  });

  bot.action(/^se:list:(\d+)$/, async (ctx) => {
    const v = await requireSessionAndAnchor<SearchState>(ctx, 'search');
    if (v === null) return;
    await ctx.answerCbQuery();
    const { query } = v.session.state;
    const view = resultsView(findHits(deps, query), Number(ctx.match[1] ?? '0'));
    await editAnchor(ctx, view.text, view.keyboard);
    persist(v.userId, v.session.anchor, { query, page: view.page });
  });

  bot.action(/^se:list:noop$/, (ctx) => ctx.answerCbQuery());

  bot.action(/^se:herb:(.+)$/, async (ctx) => {
    const v = await requireSessionAndAnchor<SearchState>(ctx, 'search');
    if (v === null) return;
    await ctx.answerCbQuery();
    const herbId = ctx.match[1] ?? '';
    const view = herbView(deps, herbId);
    if (view === null) return;
    await editAnchor(ctx, view.text, view.keyboard);
    persist(v.userId, v.session.anchor, {
      query: v.session.state.query,
      page: v.session.state.page,
      herbId,
    });
  });

  bot.action(/^se:back$/, async (ctx) => {
    const v = await requireSessionAndAnchor<SearchState>(ctx, 'search');
    if (v === null) return;
    await ctx.answerCbQuery();
    const { query, page } = v.session.state;
    const view = resultsView(findHits(deps, query), page);
    await editAnchor(ctx, view.text, view.keyboard);
    persist(v.userId, v.session.anchor, { query, page: view.page });
  });
}
