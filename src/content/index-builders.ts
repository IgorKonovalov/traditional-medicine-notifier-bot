/**
 * Builds the committed cross-file index (`content/.index/*.json`) from loaded
 * content. Pure (no Node) — the script in `scripts/build-content-index.ts`
 * handles reading/writing files. The index is a flat, body-stripped projection
 * for fast lookups and corpus-count questions without re-walking markdown.
 */

import type { Herb, LoadedContent, Tip } from './types';

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
}

export interface TipIndexEntry {
  readonly id: string;
  readonly category?: string;
  readonly source?: Tip['source'];
}

export interface ContentIndex {
  readonly counts: { herbs: number; combinations: number; categories: number; tips: number };
  readonly herbs: readonly HerbIndexEntry[];
  readonly combinations: readonly CombinationIndexEntry[];
  readonly categories: readonly CategoryIndexEntry[];
  readonly tips: readonly TipIndexEntry[];
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
  }));

  const herbCountByCategory = new Map<string, number>();
  for (const h of content.herbs.all) {
    herbCountByCategory.set(h.category, (herbCountByCategory.get(h.category) ?? 0) + 1);
  }

  const categories: CategoryIndexEntry[] = content.categories.all.map((c) => ({
    id: c.id,
    nameRu: c.nameRu,
    herbCount: herbCountByCategory.get(c.id) ?? 0,
  }));

  const tips: TipIndexEntry[] = content.tips.all.map((t) => ({
    id: t.id,
    ...(t.category !== undefined ? { category: t.category } : {}),
    ...(t.source !== undefined ? { source: t.source } : {}),
  }));

  return {
    counts: {
      herbs: herbs.length,
      combinations: combinations.length,
      categories: categories.length,
      tips: tips.length,
    },
    herbs,
    combinations,
    categories,
    tips,
  };
}
