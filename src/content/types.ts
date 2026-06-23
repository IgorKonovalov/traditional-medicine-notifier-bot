/**
 * Content domain types. Pure — no Node, no DB. The corpus is read-only at
 * runtime: markdown under `content/` is loaded once at boot into these shapes,
 * and the DB stores only user state. Content `id`s are stable join keys.
 */

export type Tradition = 'chinese' | 'tibetan';

export const TRADITIONS: readonly Tradition[] = ['chinese', 'tibetan'];

/**
 * A herb / remedy reference card. `body` is the Russian markdown description
 * (renderer-agnostic, ADR 002) and always ends with the standard informational
 * disclaimer at author time.
 */
export interface Herb {
  readonly id: string;
  readonly tradition: Tradition;
  /** kebab-case category id; must resolve to a `Category`. */
  readonly category: string;
  /** Russian display name. */
  readonly nameRu: string;
  /** Botanical Latin name, if known. */
  readonly nameLatin?: string;
  /** Pinyin (TCM) or transliterated Tibetan name, if known. */
  readonly nameOriginal?: string;
  /** Descriptive traditional properties (e.g. "тёплый", "горький"). */
  readonly properties: readonly string[];
  /** Descriptive traditional uses — never prescriptive. */
  readonly uses: readonly string[];
  /** Cautions / contraindications surfaced to the reader. */
  readonly cautions: readonly string[];
  readonly tags: readonly string[];
  readonly body: string;
}

/** A subscribable topic category. Its `id` is the subscription key. */
export interface Category {
  readonly id: string;
  readonly nameRu: string;
  readonly body: string;
}

/** A daily-tip entry. Optionally scoped to a category. */
export interface Tip {
  readonly id: string;
  readonly category?: string;
  readonly body: string;
}

export interface ContentBucket<T> {
  readonly all: readonly T[];
  readonly byId: ReadonlyMap<string, T>;
}

export interface LoadedContent {
  readonly herbs: ContentBucket<Herb>;
  readonly categories: ContentBucket<Category>;
  readonly tips: ContentBucket<Tip>;
}
