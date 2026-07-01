/**
 * 📚 Библиотека — the unified reference surface (Plan 009, ADR 009). One anchor
 * message, edited in place across screens:
 *
 *   hub → 🌿 Травы → (Все травы | По категории) → herb list → herb card
 *       → 💡 Случайный совет (in-anchor, random per tap — Plan 021)
 *       → 🧪 Составы (formula browser, live post sign-off — gated by `_formula-gate`;
 *         labelled «Составы» while code/ids keep the "formula/combination" vocabulary)
 *
 * Supersedes the old standalone `/browse` drilldown: the persistent-menu
 * 📚 Библиотека button and the `/browse` shortcut both land here, and the
 * notification "Открыть" CTA opens a herb card as a fresh library session
 * (`openHerbCardAnchor`). The herb card itself is rendered by the shared
 * `_herb-card` module so every entry point is identical (render-time disclaimer,
 * ADR 006).
 *
 * This module is the callback registrar and the package barrel. The state-machine
 * dispatch (`viewFor`/`backState`) lives in `dispatch.ts`, the entry points in
 * `entries.ts`, the shared state + anchor kit in `state.ts`, and each branch's
 * view builders in its own sibling (`herbs`/`search`/`formulas`/`guides`/`foods`/
 * `tips`/`hub`) — Plan 029 split.
 *
 * Callback scope `lib:` — `lib:herbs`, `lib:all`, `lib:bycat`,
 * `lib:cat:<id>`, `lib:catpg:<page>`, `lib:list:<page>`, `lib:herb:<id>`,
 * `lib:tips`, `lib:back`, `lib:home`. Each payload runs through
 * `assertCallbackData` and uses stable content ids (≤64 bytes).
 */

import { type Context, type Telegraf } from 'telegraf';

import { type FoodGroup, FOOD_GROUPS } from '../../../content/types';
import type { BotDeps } from '../../context';
import { getUserId } from '../../context';
import { type AnchoredSession, loadSession } from '../../session-store';
import { type ValidatedCallback } from '../_callback-prologue';
import { FORMULA_BRANCH_ENABLED } from '../_formula-gate';
import { onAck, onSession } from '../_session-registrar';
import { backState, viewFor } from './dispatch';
import {
  libraryEntry,
  libraryFoodsEntry,
  libraryGuidesEntry,
  libraryHerbsEntry,
  librarySearchEntry,
} from './entries';
import { FOOD_CON_BY_SLUG } from './foods';
import { editView, editViewAt, type LibraryState, persist } from './state';

export function registerLibraryCommand(bot: Telegraf, deps: BotDeps): void {
  /** Edit the anchor to `next`, clamping its page/section, and persist. */
  const go = async (
    ctx: Context,
    v: ValidatedCallback<LibraryState>,
    next: LibraryState,
  ): Promise<void> => {
    const out = viewFor(deps, next, v.userId);
    await editView(ctx, out);
    persist(v.userId, v.session.anchor, {
      ...next,
      page: out.page,
      ...(out.section !== undefined ? { section: out.section } : {}),
    });
  };

  bot.command('library', libraryEntry);
  bot.command('browse', libraryHerbsEntry);
  bot.command('guides', (ctx) => libraryGuidesEntry(ctx, deps));
  bot.command('foods', (ctx) => libraryFoodsEntry(ctx, deps));
  bot.command('search', async (ctx) => {
    const raw = ctx.message.text.replace(/^\/search(@\w+)?\s*/i, '');
    await librarySearchEntry(ctx, deps, raw);
  });

  onSession<LibraryState>(bot, /^lib:herbs$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'herbs', page: 0 }),
  );

  onSession<LibraryState>(bot, /^lib:all$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'list', page: 0 }),
  );

  onSession<LibraryState>(bot, /^lib:bycat$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'pick-category', page: 0 }),
  );

  onSession<LibraryState>(bot, /^lib:cat:(.+)$/, 'library', async (ctx, v) => {
    const category = ctx.match[1] ?? '';
    if (!deps.content.categories.byId.has(category)) return;
    await go(ctx, v, { screen: 'list', category, page: 0 });
  });

  onSession<LibraryState>(bot, /^lib:catpg:(\d+)$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'pick-category', page: Number(ctx.match[1] ?? '0') }),
  );

  onAck(bot, /^lib:catpg:noop$/);

  onSession<LibraryState>(bot, /^lib:list:(\d+)$/, 'library', (ctx, v) => {
    const { category } = v.session.state;
    return go(ctx, v, {
      screen: 'list',
      page: Number(ctx.match[1] ?? '0'),
      ...(category !== undefined ? { category } : {}),
    });
  });

  onAck(bot, /^lib:list:noop$/);

  onSession<LibraryState>(bot, /^lib:herb:(.+)$/, 'library', (ctx, v) => {
    const { category, query, page } = v.session.state;
    return go(ctx, v, {
      screen: 'card',
      herbId: ctx.match[1] ?? '',
      page,
      // Carry the origin so `« Назад` returns to the right screen: search results,
      // a category list, else the flat «Все травы» list (the only remaining list).
      ...(query !== undefined
        ? { query }
        : category !== undefined
          ? { category }
          : { allList: true }),
    });
  });

  onSession<LibraryState>(bot, /^lib:search$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'search', page: 0 }),
  );

  onSession<LibraryState>(bot, /^lib:results:(\d+)$/, 'library', async (ctx, v) => {
    const { query } = v.session.state;
    if (query === undefined) return;
    await go(ctx, v, { screen: 'results', query, page: Number(ctx.match[1] ?? '0') });
  });

  onAck(bot, /^lib:results:noop$/);

  // 📖 Статьи — the guides branch (Plan 006). Always registered.
  onSession<LibraryState>(bot, /^lib:guides$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'guide-list', page: 0 }),
  );

  onSession<LibraryState>(bot, /^lib:glist:(\d+)$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'guide-list', page: Number(ctx.match[1] ?? '0') }),
  );

  onAck(bot, /^lib:glist:noop$/);

  onSession<LibraryState>(bot, /^lib:guide:(.+)$/, 'library', async (ctx, v) => {
    const guideId = ctx.match[1] ?? '';
    if (!deps.content.guides.byId.has(guideId)) return;
    // Carry the current list page so `« Назад` returns to it.
    await go(ctx, v, {
      screen: 'guide-section',
      guideId,
      section: 0,
      page: v.session.state.page,
    });
  });

  onSession<LibraryState>(bot, /^lib:gsec:(\d+)$/, 'library', async (ctx, v) => {
    const { guideId, page } = v.session.state;
    if (guideId === undefined) return;
    await go(ctx, v, {
      screen: 'guide-section',
      guideId,
      section: Number(ctx.match[1] ?? '0'),
      page,
    });
  });

  onAck(bot, /^lib:gsec:noop$/);

  // 🥗 Продукты — the foods browse + filter branch (Plan 013, ADR 012). Always
  // registered; reads from the in-memory `foods` bucket like every other branch.
  onSession<LibraryState>(bot, /^lib:foods$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'food-groups', page: 0 }),
  );

  onSession<LibraryState>(bot, /^lib:fglist:(\d+)$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'food-groups', page: Number(ctx.match[1] ?? '0') }),
  );

  onAck(bot, /^lib:fglist:noop$/);

  onSession<LibraryState>(bot, /^lib:fg:(.+)$/, 'library', async (ctx, v) => {
    const group = ctx.match[1] ?? '';
    if (!FOOD_GROUPS.includes(group as FoodGroup)) return;
    await go(ctx, v, { screen: 'food-list', foodGroup: group as FoodGroup, page: 0 });
  });

  onSession<LibraryState>(bot, /^lib:ffil$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'food-filter', page: 0 }),
  );

  onSession<LibraryState>(bot, /^lib:fcon:(w|b|p)$/, 'library', async (ctx, v) => {
    const foodCon = FOOD_CON_BY_SLUG[ctx.match[1] ?? ''];
    if (foodCon === undefined) return;
    await go(ctx, v, { screen: 'food-list', foodCon, page: 0 });
  });

  onSession<LibraryState>(bot, /^lib:fwarm:(warm|cool)$/, 'library', (ctx, v) => {
    const foodWarm = ctx.match[1] === 'warm' ? 'warm' : 'cool';
    return go(ctx, v, { screen: 'food-list', foodWarm, page: 0 });
  });

  onSession<LibraryState>(bot, /^lib:flpg:(\d+)$/, 'library', (ctx, v) => {
    // Carry whichever facet selected this list so the page stays on the same set.
    const { foodGroup, foodCon, foodWarm } = v.session.state;
    return go(ctx, v, {
      screen: 'food-list',
      page: Number(ctx.match[1] ?? '0'),
      ...(foodGroup !== undefined
        ? { foodGroup }
        : foodCon !== undefined
          ? { foodCon }
          : foodWarm !== undefined
            ? { foodWarm }
            : {}),
    });
  });

  onAck(bot, /^lib:flpg:noop$/);

  onSession<LibraryState>(bot, /^lib:food:(.+)$/, 'library', async (ctx, v) => {
    const foodId = ctx.match[1] ?? '';
    if (!deps.content.foods.byId.has(foodId)) return;
    // Carry the originating facet + page so `« Назад` returns to the right list.
    const { foodGroup, foodCon, foodWarm, page } = v.session.state;
    await go(ctx, v, {
      screen: 'food-card',
      foodId,
      page,
      ...(foodGroup !== undefined
        ? { foodGroup }
        : foodCon !== undefined
          ? { foodCon }
          : foodWarm !== undefined
            ? { foodWarm }
            : {}),
    });
  });

  // 🧪 Составы (formulas) — built but registered ONLY when the doctor-gate is
  // lifted (ADR 006, `_formula-gate`). While withheld, these handlers (including
  // the formula-only search `lib:fsearch`/`lib:fresults`) are never wired, so even
  // a hand-crafted `lib:formula:*` / `lib:fsearch` callback falls through to a no-op.
  if (FORMULA_BRANCH_ENABLED) {
    onSession<LibraryState>(bot, /^lib:formulas$/, 'library', (ctx, v) =>
      go(ctx, v, { screen: 'formula-list', page: 0 }),
    );

    onSession<LibraryState>(bot, /^lib:flist:(\d+)$/, 'library', (ctx, v) =>
      go(ctx, v, { screen: 'formula-list', page: Number(ctx.match[1] ?? '0') }),
    );

    onAck(bot, /^lib:flist:noop$/);

    // 🔎 Поиск по составам — the formula-only search prompt (Plan 017).
    onSession<LibraryState>(bot, /^lib:fsearch$/, 'library', (ctx, v) =>
      go(ctx, v, { screen: 'formula-search', page: 0 }),
    );

    onSession<LibraryState>(bot, /^lib:fresults:(\d+)$/, 'library', async (ctx, v) => {
      const { query } = v.session.state;
      if (query === undefined) return;
      await go(ctx, v, { screen: 'formula-results', query, page: Number(ctx.match[1] ?? '0') });
    });

    onAck(bot, /^lib:fresults:noop$/);

    onSession<LibraryState>(bot, /^lib:formula:(.+)$/, 'library', async (ctx, v) => {
      const formulaId = ctx.match[1] ?? '';
      if (!deps.content.combinations.byId.has(formulaId)) return;
      const { query, page, screen } = v.session.state;
      await go(ctx, v, {
        screen: 'formula-card',
        formulaId,
        page,
        // Carry a search origin so `« Назад` returns to the results; mark
        // formula-only origin so it returns to the formula results, not the
        // global mixed ones.
        ...(query !== undefined ? { query } : {}),
        ...(screen === 'formula-results' ? { formulaScope: true } : {}),
      });
    });
  }

  onSession<LibraryState>(bot, /^lib:tips$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'tips', page: 0 }),
  );

  onSession<LibraryState>(bot, /^lib:back$/, 'library', (ctx, v) =>
    go(ctx, v, backState(v.session.state)),
  );

  onSession<LibraryState>(bot, /^lib:home$/, 'library', (ctx, v) =>
    go(ctx, v, { screen: 'hub', page: 0 }),
  );
}

/**
 * Free-text search-query capture. Registered **after** the menu router so a menu
 * tap (handled by `bot.hears`) wins; this consumes a plain text message only
 * while the library session is parked on the `search` prompt (→ global `results`)
 * or the `formula-search` prompt (→ formula-only `formula-results`), editing the
 * anchor into the matching results, and calls `next()` otherwise so it never
 * swallows unrelated messages (mirrors the reminder-create / feedback captures).
 */
export function registerLibrarySearchTextCapture(bot: Telegraf, deps: BotDeps): void {
  bot.on('text', async (ctx, next) => {
    const userId = getUserId(ctx);
    if (userId === undefined) {
      await next();
      return;
    }
    const session = loadSession<AnchoredSession<LibraryState>>(userId, 'library');
    const parked = session?.state.screen;
    if (session === null || (parked !== 'search' && parked !== 'formula-search')) {
      await next();
      return;
    }
    const msg = ctx.message;
    const raw = msg !== undefined && 'text' in msg ? msg.text.trim() : '';
    if (raw === '') {
      await next();
      return;
    }
    const query = raw.toLowerCase();
    const state: LibraryState =
      parked === 'formula-search'
        ? { screen: 'formula-results', query, page: 0 }
        : { screen: 'results', query, page: 0 };
    const out = viewFor(deps, state, userId);
    await editViewAt(ctx, session.anchor.messageId, out);
    persist(userId, session.anchor, { ...state, page: out.page });
  });
}

// ─── consumer/test re-exports (Plan 029 split kept the same import surface) ──────

export {
  libraryEntry,
  libraryFoodsEntry,
  libraryGuidesEntry,
  libraryHerbsEntry,
  librarySearchEntry,
  openFormulaCardAnchor,
  openHerbCardAnchor,
} from './entries';
export { backState } from './dispatch';
export { clampPage } from './state';
export { hubView } from './hub';
export { formulaMatches, herbMatches, searchHits } from './search';
export { formulaListView, formulaResultsView } from './formulas';
export { foodGroupsView, foodListView } from './foods';
