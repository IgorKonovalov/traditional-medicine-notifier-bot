/**
 * 🥗 Продукты branch of the library (Plan 013, ADR 012). Browse foods by group,
 * or filter by which начало a food pacifies / by warmth band, then the food
 * card. Reads from the in-memory `foods` bucket like every other branch.
 */

import { Markup } from 'telegraf';

import { type Food, type FoodGroup, FOOD_GROUPS, type Warmth } from '../../../content/types';
import type { BotDeps } from '../../context';
import { assertCallbackData, backRow, homeRow, pager } from '../../keyboards';
import { messages } from '../../messages';
import {
  type CallbackButton,
  clampPage,
  type FoodConstitution,
  type FoodWarmthBand,
  type LibraryState,
  PAGE_SIZE,
  type View,
} from './state';

/** Which warmth levels each band collects (нейтральная is in neither). */
const FOOD_WARMTH_BANDS: Record<FoodWarmthBand, readonly Warmth[]> = {
  warm: ['горячая', 'тёплая'],
  cool: ['прохладная', 'холодная'],
};

/** Map the compact constitution-filter slug (w|b|p) to its canonical key. */
export const FOOD_CON_BY_SLUG: Record<string, FoodConstitution> = {
  w: 'wind',
  b: 'bile',
  p: 'phlegm',
};

/** The food groups that hold at least one food, in catalogue order, with counts. */
function foodGroupsPresent(deps: BotDeps): { group: FoodGroup; count: number }[] {
  return FOOD_GROUPS.map((group) => ({
    group,
    count: deps.content.foods.all.filter((f) => f.group === group).length,
  })).filter((g) => g.count > 0);
}

/** Foods the current `food-list` state selects — by group xor constitution xor
 *  warmth band, else (no facet) the whole catalogue. */
function foodsFor(deps: BotDeps, state: LibraryState): readonly Food[] {
  const all = deps.content.foods.all;
  if (state.foodGroup !== undefined) return all.filter((f) => f.group === state.foodGroup);
  if (state.foodCon !== undefined) {
    const con = state.foodCon;
    return all.filter((f) => f.constitutions[con] === 'pacifies');
  }
  if (state.foodWarm !== undefined) {
    const band = FOOD_WARMTH_BANDS[state.foodWarm];
    return all.filter((f) => band.includes(f.warmth));
  }
  return all;
}

/** Title for the active `food-list` (group name, constitution band, or warmth band). */
function foodListTitle(state: LibraryState): string {
  if (state.foodGroup !== undefined) return messages.foods.groupTitle(state.foodGroup);
  if (state.foodCon === 'wind') return messages.foods.filterWind;
  if (state.foodCon === 'bile') return messages.foods.filterBile;
  if (state.foodCon === 'phlegm') return messages.foods.filterPhlegm;
  if (state.foodWarm === 'warm') return messages.foods.warmTitle;
  if (state.foodWarm === 'cool') return messages.foods.coolTitle;
  return messages.library.foods;
}

/**
 * The whole group taxonomy fits on one screen (it is short and bounded by
 * `FOOD_GROUPS`), so it is never split into pages — unlike content lists, a
 * paginated navigation root is pure friction. The `lib:fglist` pager stays wired
 * but only ever fires if the taxonomy outgrows this; for now it never does.
 */
const FOOD_GROUPS_PAGE_SIZE = FOOD_GROUPS.length;

/** The 🥗 Продукты root: a filter entry then one button per non-empty group. */
export function foodGroupsView(deps: BotDeps, page: number): View & { readonly page: number } {
  const groups = foodGroupsPresent(deps);
  if (groups.length === 0) {
    return {
      text: messages.foods.emptyGroups,
      keyboard: Markup.inlineKeyboard([backRow('lib:back'), homeRow('lib:home')]),
      page: 0,
    };
  }
  const { page: safePage, pageCount } = clampPage(page, groups.length, FOOD_GROUPS_PAGE_SIZE);
  const slice = groups.slice(
    safePage * FOOD_GROUPS_PAGE_SIZE,
    safePage * FOOD_GROUPS_PAGE_SIZE + FOOD_GROUPS_PAGE_SIZE,
  );
  // The filter entry sits as the first row, above the groups, on every page.
  const filterRow: CallbackButton[] = [
    Markup.button.callback(messages.foods.filterEntry, 'lib:ffil'),
  ];
  const rows = slice.map((g) => [
    Markup.button.callback(
      messages.foods.groupButton(g.group, g.count),
      assertCallbackData(`lib:fg:${g.group}`),
    ),
  ]);
  const nav: CallbackButton[][] = [];
  if (pageCount > 1) nav.push(pager('lib:fglist', safePage, pageCount));
  nav.push(backRow('lib:back'), homeRow('lib:home'));
  return {
    text: messages.foods.groupsTitle,
    keyboard: Markup.inlineKeyboard([filterRow, ...rows, ...nav]),
    page: safePage,
  };
}

/** The filter screen: pick a начало to pacify, or a warmth band. */
export function foodFilterView(): View {
  return {
    text: messages.foods.filterTitle,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback(messages.foods.filterWind, 'lib:fcon:w')],
      [Markup.button.callback(messages.foods.filterBile, 'lib:fcon:b')],
      [Markup.button.callback(messages.foods.filterPhlegm, 'lib:fcon:p')],
      [Markup.button.callback(messages.foods.filterWarm, 'lib:fwarm:warm')],
      [Markup.button.callback(messages.foods.filterCool, 'lib:fwarm:cool')],
      backRow('lib:back'),
      homeRow('lib:home'),
    ]),
  };
}

export function foodListView(deps: BotDeps, state: LibraryState): View & { readonly page: number } {
  const foods = foodsFor(deps, state);
  if (foods.length === 0) {
    return {
      text: messages.foods.emptyList,
      keyboard: Markup.inlineKeyboard([backRow('lib:back'), homeRow('lib:home')]),
      page: 0,
    };
  }
  const { page: safePage, pageCount } = clampPage(state.page, foods.length);
  const slice = foods.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const rows = slice.map((f) => [
    Markup.button.callback(f.nameRu, assertCallbackData(`lib:food:${f.id}`)),
  ]);
  const nav: CallbackButton[][] = [];
  if (pageCount > 1) nav.push(pager('lib:flpg', safePage, pageCount));
  nav.push(backRow('lib:back'), homeRow('lib:home'));
  return {
    text: foodListTitle(state),
    keyboard: Markup.inlineKeyboard([...rows, ...nav]),
    page: safePage,
  };
}

/** Food card, or null when the id is unknown (stale tap / bad deep link). */
export function foodCardView(deps: BotDeps, foodId: string): View | null {
  const food = deps.content.foods.byId.get(foodId);
  if (food === undefined) return null;
  return {
    text: messages.foods.card(food),
    keyboard: Markup.inlineKeyboard([backRow('lib:back'), homeRow('lib:home')]),
  };
}
