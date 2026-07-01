/**
 * Shared kit for the 📚 Библиотека drilldown (Plan 009, split out in Plan 029).
 * The unified session state, the `View` transport type, and the anchor-dispatch
 * + persistence helpers that every branch module and the orchestrator share.
 * This module carries no branch-specific logic — each branch
 * (herbs/search/formulas/guides/foods) lives in its own sibling.
 */

import { Markup, type Context } from 'telegraf';

import type { FoodGroup } from '../../../content/types';
import {
  type Anchor,
  editAnchor,
  editAnchorAt,
  editAnchorAtHtml,
  editAnchorHtml,
  sendAnchor,
  sendAnchorHtml,
} from '../../render/anchor';
import { unsafeHtml } from '../../render/html';
import { type AnchoredSession, saveSession, SESSION_TTL_MS } from '../../session-store';

export const PAGE_SIZE = 8;

/** Which screen of the library drilldown is showing. */
export type Screen =
  | 'hub'
  | 'herbs'
  | 'pick-category'
  | 'list'
  | 'card'
  | 'tips'
  | 'search'
  | 'results'
  | 'guide-list'
  | 'guide-section'
  | 'formula-list'
  | 'formula-search'
  | 'formula-results'
  | 'formula-card'
  | 'food-groups'
  | 'food-filter'
  | 'food-list'
  | 'food-card';

/** Which constitution a food filter pacifies (the canonical Ветер/Желчь/Слизь key). */
export type FoodConstitution = 'wind' | 'bile' | 'phlegm';
/** Warmth band the warmth filter selects (тёплые vs прохладные). */
export type FoodWarmthBand = 'warm' | 'cool';

/**
 * Library drilldown state. `category` xor `query` records how the current herb
 * list / results were reached (so `« Назад` from a card returns to the right
 * origin and a list returns to the right screen); a list reached with neither is
 * the flat «Все травы» list of all visible herbs (ADR 013, Tibetan-only). `page`
 * is the active list/results/picker page; `herbId` is set while a herb card is
 * open, `formulaId` while a formula card is open.
 */
export interface LibraryState {
  readonly screen: Screen;
  readonly category?: string;
  /**
   * Marks a card whose origin is the flat «Все травы» list (no category/query),
   * so `« Назад` returns there rather than to the hub — the latter being the
   * fallback for a context-free card from the notification "Открыть" deep link.
   */
  readonly allList?: true;
  /** Normalized (lowercased) search query — set on the results/search screens. */
  readonly query?: string;
  readonly page: number;
  readonly herbId?: string;
  readonly formulaId?: string;
  /**
   * Marks a `formula-card` opened from the formula-only `formula-results` screen,
   * so `« Назад` returns to those results rather than the global mixed `results`
   * (both carry `query`; this discriminates origin). Set at card-open time from
   * the originating screen — the single source of truth for the back-state.
   */
  readonly formulaScope?: true;
  /** Open guide id (guide-section screen). */
  readonly guideId?: string;
  /** Active page index within the open guide (guide-section pager). */
  readonly section?: number;
  /**
   * How the current `food-list` was reached — exactly one of these is set, the
   * same xor that herb lists use for `category`/`query`: a group browse
   * (`foodGroup`), a constitution filter (`foodCon`, foods that pacify it), or a
   * warmth-band filter (`foodWarm`). They also mark a `food-card`'s origin so
   * `« Назад` returns to the right list/filter.
   */
  readonly foodGroup?: FoodGroup;
  readonly foodCon?: FoodConstitution;
  readonly foodWarm?: FoodWarmthBand;
  /** Open food id (food-card screen). */
  readonly foodId?: string;
}

export interface View {
  readonly text: string;
  readonly keyboard: ReturnType<typeof Markup.inlineKeyboard>;
  /**
   * Opt-in HTML render discriminator (ADR 011) — when set, the anchor dispatch
   * uses the HTML-aware helper; omitted on every plain-text branch.
   */
  readonly html?: true;
}

export type CallbackButton = ReturnType<typeof Markup.button.callback>;

// ─── view dispatch (plain vs HTML, ADR 011) ─────────────────────────────────────

// unsafeHtml is legitimate here: an html-flagged View's text was already minted
// through the escaping `html` template in renderFormula; View.text is the plain
// transport type. Plain Views go through the untouched plain helpers (ADR 011).
export function sendView(ctx: Context, view: View): Promise<Anchor> {
  return view.html
    ? sendAnchorHtml(ctx, unsafeHtml(view.text), view.keyboard)
    : sendAnchor(ctx, view.text, view.keyboard);
}
export function editView(ctx: Context, view: View): Promise<void> {
  return view.html
    ? editAnchorHtml(ctx, unsafeHtml(view.text), view.keyboard)
    : editAnchor(ctx, view.text, view.keyboard);
}
export function editViewAt(ctx: Context, messageId: number, view: View): Promise<void> {
  return view.html
    ? editAnchorAtHtml(ctx, messageId, unsafeHtml(view.text), view.keyboard)
    : editAnchorAt(ctx, messageId, view.text, view.keyboard);
}

export function persist(userId: number, anchor: Anchor, state: LibraryState): void {
  const session: AnchoredSession<LibraryState> = { anchor, state };
  saveSession(userId, 'library', session, SESSION_TTL_MS);
}

/**
 * Clamp a requested page into `[0, pageCount)` for a list of `itemCount` items.
 * Pure and exported so the pager never wraps past either end — a tap on an edge
 * page resolves to the same page (the `:noop` button it carries is a no-op).
 */
export function clampPage(
  page: number,
  itemCount: number,
  pageSize: number = PAGE_SIZE,
): { readonly page: number; readonly pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(itemCount / pageSize));
  return { page: Math.min(Math.max(page, 0), pageCount - 1), pageCount };
}
