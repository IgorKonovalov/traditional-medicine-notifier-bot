/**
 * The library state-machine core (Plan 029 split): `viewFor` renders whichever
 * screen the state names by delegating to the branch view builders, and
 * `backState` computes the `« Назад` target. Both are the single places that know
 * about every screen; the branch modules stay independent of each other.
 */

import type { BotDeps } from '../../context';
import { foodCardView, foodFilterView, foodGroupsView, foodListView } from './foods';
import {
  formulaCardView,
  formulaListView,
  formulaResultsView,
  formulaSearchPromptView,
} from './formulas';
import { guideListView, guideSectionView } from './guides';
import { cardView, categoryPickView, herbsMenuView, listView } from './herbs';
import { hubView } from './hub';
import { resultsView, searchPromptView } from './search';
import { type LibraryState, type View } from './state';
import { tipsView } from './tips';

/**
 * Render whichever screen `state` names, clamping page where it paginates.
 * `userId` is threaded through only for the `tips` screen, whose render is a
 * random pick that records into the user's recent-tip history (Plan 021); every
 * other screen ignores it.
 */
export function viewFor(
  deps: BotDeps,
  state: LibraryState,
  userId: number | undefined,
): View & { readonly page: number; readonly section?: number } {
  switch (state.screen) {
    case 'herbs':
      return { ...herbsMenuView(), page: 0 };
    case 'pick-category':
      return categoryPickView(deps, state.page);
    case 'list':
      return listView(deps, state);
    case 'tips':
      return { ...tipsView(deps, userId), page: 0 };
    case 'search':
      return { ...searchPromptView(), page: 0 };
    case 'results':
      return resultsView(deps, state);
    case 'guide-list':
      return guideListView(deps, state.page);
    case 'guide-section':
      return guideSectionView(deps, state);
    case 'formula-list':
      return formulaListView(deps, state.page);
    case 'formula-search':
      return { ...formulaSearchPromptView(), page: 0 };
    case 'formula-results':
      return formulaResultsView(deps, state);
    case 'formula-card': {
      const card = formulaCardView(deps, state.formulaId ?? '');
      return card === null ? { ...hubView(), page: 0 } : { ...card, page: state.page };
    }
    case 'card': {
      const card = cardView(deps, state.herbId ?? '');
      return card === null ? { ...hubView(), page: 0 } : { ...card, page: state.page };
    }
    case 'food-groups':
      return foodGroupsView(deps, state.page);
    case 'food-filter':
      return { ...foodFilterView(), page: 0 };
    case 'food-list':
      return foodListView(deps, state);
    case 'food-card': {
      const card = foodCardView(deps, state.foodId ?? '');
      return card === null ? { ...hubView(), page: 0 } : { ...card, page: state.page };
    }
    case 'hub':
    default:
      return { ...hubView(), page: 0 };
  }
}

/** The screen `« Назад` returns to from `state`. Exported for navigation tests. */
export function backState(state: LibraryState): LibraryState {
  switch (state.screen) {
    case 'card':
      // Back to the originating screen: search results, then a herb list, else
      // the hub (a context-free card from the notification "Открыть" deep link).
      if (state.query !== undefined) {
        return { screen: 'results', query: state.query, page: state.page };
      }
      if (state.category !== undefined) {
        return { screen: 'list', page: state.page, category: state.category };
      }
      // A card from the flat «Все травы» list returns to that list; a context-free
      // card (notification deep link) carries no origin marker and falls to hub.
      if (state.allList === true) {
        return { screen: 'list', page: state.page };
      }
      return { screen: 'hub', page: 0 };
    case 'list':
      // The category list returns to the category picker; the flat «Все травы»
      // list returns to the herbs sub-menu.
      return state.category !== undefined
        ? { screen: 'pick-category', page: 0 }
        : { screen: 'herbs', page: 0 };
    case 'pick-category':
      return { screen: 'herbs', page: 0 };
    case 'results':
      return { screen: 'search', page: 0 };
    case 'guide-section':
      // Back to the guide list, restoring the list page the guide was opened from.
      return { screen: 'guide-list', page: state.page };
    case 'formula-card':
      // Origin precedence: the formula-only results (formulaScope + query), then
      // the global mixed results (query alone), else the flat formula list.
      if (state.formulaScope === true && state.query !== undefined) {
        return { screen: 'formula-results', query: state.query, page: state.page };
      }
      if (state.query !== undefined) {
        return { screen: 'results', query: state.query, page: state.page };
      }
      return { screen: 'formula-list', page: state.page };
    case 'formula-results':
      return { screen: 'formula-search', page: 0 };
    case 'formula-search':
      return { screen: 'formula-list', page: 0 };
    case 'food-card':
      // Back to the originating list, restoring its facet (group xor constitution
      // xor warmth) and page so the list reappears exactly as it was left.
      return {
        screen: 'food-list',
        page: state.page,
        ...(state.foodGroup !== undefined
          ? { foodGroup: state.foodGroup }
          : state.foodCon !== undefined
            ? { foodCon: state.foodCon }
            : state.foodWarm !== undefined
              ? { foodWarm: state.foodWarm }
              : {}),
      };
    case 'food-list':
      // A group list returns to the groups screen; a filter list to the filter screen.
      return state.foodGroup !== undefined
        ? { screen: 'food-groups', page: 0 }
        : { screen: 'food-filter', page: 0 };
    case 'food-filter':
      return { screen: 'food-groups', page: 0 };
    case 'formula-list':
    case 'guide-list':
    case 'food-groups':
    case 'herbs':
    case 'tips':
    case 'search':
    default:
      return { screen: 'hub', page: 0 };
  }
}
