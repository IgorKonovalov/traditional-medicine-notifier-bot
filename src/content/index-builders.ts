/**
 * Builds the committed cross-file index (`content/.index/*.json`) from loaded
 * content. Pure (no Node) — the script in `scripts/build-content-index.ts`
 * handles reading/writing files. The index is a flat, body-stripped projection
 * for fast lookups and corpus-count questions without re-walking markdown.
 */

import type { Food, Guide, Herb, LoadedContent, Tip } from './types';

export interface HerbIndexEntry {
  readonly id: string;
  readonly tradition: Herb['tradition'];
  readonly category: string;
  readonly nameRu: string;
  readonly nameLatin?: string;
  readonly nameOriginal?: string;
  readonly tags: readonly string[];
}

export interface CombinationIndexEntry {
  readonly id: string;
  readonly nameRu: string;
  readonly nameOriginal?: string;
  /** Combination category id (ADR 007), when classified (e.g. `rinchen-pills`). */
  readonly category?: string;
  /** Thermal nature / essence (#1), when known. */
  readonly nature?: string;
  readonly tags: readonly string[];
  readonly memberCount: number;
  readonly sourceCount: number;
  /** Whether the record carries verbose source indications (ADR 006). */
  readonly hasIndications: boolean;
}

export interface CategoryIndexEntry {
  readonly id: string;
  readonly nameRu: string;
  readonly herbCount: number;
  /** Combinations classified under this category (ADR 007). */
  readonly combinationCount: number;
}

export interface TipIndexEntry {
  readonly id: string;
  /** Publication tier (ADR 014); `staging` tips are indexed but production-hidden. */
  readonly status: Tip['status'];
  readonly category?: string;
  readonly source?: Tip['source'];
}

export interface GuideIndexEntry {
  readonly id: string;
  readonly tradition: Guide['tradition'];
  readonly title: string;
  readonly sectionCount: number;
  readonly source?: Guide['source'];
}

/**
 * Projected food facets (ADR 012) — enough for the browse list, group counts,
 * and the constitution/warmth filters without re-walking markdown. `effect`
 * prose and `body` stay out of the index, like every other type's body.
 */
export interface FoodIndexEntry {
  readonly id: string;
  readonly tradition: Food['tradition'];
  readonly nameRu: string;
  readonly group: Food['group'];
  readonly warmth: Food['warmth'];
  readonly constitutions: Food['constitutions'];
  readonly tags: readonly string[];
}

export interface ContentIndex {
  readonly counts: {
    herbs: number;
    combinations: number;
    categories: number;
    tips: number;
    guides: number;
    foods: number;
  };
  readonly herbs: readonly HerbIndexEntry[];
  readonly combinations: readonly CombinationIndexEntry[];
  readonly categories: readonly CategoryIndexEntry[];
  readonly tips: readonly TipIndexEntry[];
  readonly guides: readonly GuideIndexEntry[];
  readonly foods: readonly FoodIndexEntry[];
}

export function buildIndex(content: LoadedContent): ContentIndex {
  const herbs: HerbIndexEntry[] = content.herbs.all.map((h) => ({
    id: h.id,
    tradition: h.tradition,
    category: h.category,
    nameRu: h.nameRu,
    tags: h.tags,
    ...(h.nameLatin !== undefined ? { nameLatin: h.nameLatin } : {}),
    ...(h.nameOriginal !== undefined ? { nameOriginal: h.nameOriginal } : {}),
  }));

  const combinations: CombinationIndexEntry[] = content.combinations.all.map((c) => ({
    id: c.id,
    nameRu: c.nameRu,
    tags: c.tags,
    memberCount: c.members?.length ?? 0,
    sourceCount: c.sources.length,
    hasIndications: (c.indications?.length ?? 0) > 0,
    ...(c.nameOriginal !== undefined ? { nameOriginal: c.nameOriginal } : {}),
    ...(c.category !== undefined ? { category: c.category } : {}),
    ...(c.nature !== undefined ? { nature: c.nature } : {}),
  }));

  const herbCountByCategory = new Map<string, number>();
  for (const h of content.herbs.all) {
    herbCountByCategory.set(h.category, (herbCountByCategory.get(h.category) ?? 0) + 1);
  }

  const combinationCountByCategory = new Map<string, number>();
  for (const c of content.combinations.all) {
    if (c.category === undefined) continue;
    combinationCountByCategory.set(
      c.category,
      (combinationCountByCategory.get(c.category) ?? 0) + 1,
    );
  }

  const categories: CategoryIndexEntry[] = content.categories.all.map((c) => ({
    id: c.id,
    nameRu: c.nameRu,
    herbCount: herbCountByCategory.get(c.id) ?? 0,
    combinationCount: combinationCountByCategory.get(c.id) ?? 0,
  }));

  const tips: TipIndexEntry[] = content.tips.all.map((t) => ({
    id: t.id,
    status: t.status,
    ...(t.category !== undefined ? { category: t.category } : {}),
    ...(t.source !== undefined ? { source: t.source } : {}),
  }));

  const guides: GuideIndexEntry[] = content.guides.all.map((g) => ({
    id: g.id,
    tradition: g.tradition,
    title: g.title,
    sectionCount: g.sections.length,
    ...(g.source !== undefined ? { source: g.source } : {}),
  }));

  const foods: FoodIndexEntry[] = content.foods.all.map((f) => ({
    id: f.id,
    tradition: f.tradition,
    nameRu: f.nameRu,
    group: f.group,
    warmth: f.warmth,
    constitutions: f.constitutions,
    tags: f.tags,
  }));

  return {
    counts: {
      herbs: herbs.length,
      combinations: combinations.length,
      categories: categories.length,
      tips: tips.length,
      guides: guides.length,
      foods: foods.length,
    },
    herbs,
    combinations,
    categories,
    tips,
    guides,
    foods,
  };
}
