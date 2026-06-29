/**
 * Tradition visibility gate (ADR 013). The corpus keeps both `chinese` and
 * `tibetan` records, but the user-facing surface is **Tibetan-only** — the
 * Chinese (TCM) tradition is authored-but-hidden, not deleted.
 *
 * This is the single chokepoint: `loadContent` filters parsed herbs/combinations
 * through `isVisibleTradition` before they ever reach the buckets, cross-links,
 * or validation, so the rest of the runtime simply never sees a hidden record.
 * Re-enabling Chinese is one edit here — add `'chinese'` to `VISIBLE_TRADITIONS`.
 *
 * Pure — no Node, no DB, no Telegraf (ADR 003).
 */

import type { Tradition } from './types';

/** Traditions surfaced to the user. Tibetan-only by decision (ADR 013). */
export const VISIBLE_TRADITIONS: readonly Tradition[] = ['tibetan'];

export function isVisibleTradition(t: Tradition): boolean {
  return VISIBLE_TRADITIONS.includes(t);
}
