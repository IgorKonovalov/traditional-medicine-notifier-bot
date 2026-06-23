/**
 * Builds the committed cross-file index (`content/.index/*.json`) from loaded
 * content. Pure (no Node) — the script in `scripts/build-content-index.ts`
 * handles reading/writing files. The index is a flat, body-stripped projection
 * for fast lookups and corpus-count questions without re-walking markdown.
 */

import type { Herb, LoadedContent } from './types';

export interface HerbIndexEntry {
  readonly id: string;
  readonly tradition: Herb['tradition'];
  readonly category: string;
  readonly nameRu: string;
  readonly nameLatin?: string;
  readonly nameOriginal?: string;
  readonly tags: readonly string[];
}

export interface CategoryIndexEntry {
  readonly id: string;
  readonly nameRu: string;
  readonly herbCount: number;
}

export interface TipIndexEntry {
  readonly id: string;
  readonly category?: string;
}

export interface ContentIndex {
  readonly counts: { herbs: number; categories: number; tips: number };
  readonly herbs: readonly HerbIndexEntry[];
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
  }));

  return {
    counts: { herbs: herbs.length, categories: categories.length, tips: tips.length },
    herbs,
    categories,
    tips,
  };
}
