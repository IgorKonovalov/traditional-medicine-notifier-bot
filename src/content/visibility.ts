/**
 * Content visibility gates. The corpus keeps records that are authored-but-hidden
 * from the runtime — the gate drops them at the single `loadContent` chokepoint
 * (before buckets, cross-links, validation) so nothing downstream ever sees them,
 * while the index builder opts out so the committed index keeps the full corpus.
 *
 * Two gates live here:
 *   - **Tradition** (ADR 013): the user-facing surface is Tibetan-only; Chinese
 *     (TCM) records are hidden, not deleted. Re-enable = add `'chinese'` below.
 *   - **Tip status** (ADR 014): gated disease-indication tips (`status: staging`)
 *     stay out of the production pool until documented doctor sign-off. Promotion
 *     is per-tip — drop the `status: staging` flag once a tip is approved.
 *
 * Pure — no Node, no DB, no Telegraf (ADR 003).
 */

import type { Tip, Tradition } from './types';

/** Traditions surfaced to the user. Tibetan-only by decision (ADR 013). */
export const VISIBLE_TRADITIONS: readonly Tradition[] = ['tibetan'];

export function isVisibleTradition(t: Tradition): boolean {
  return VISIBLE_TRADITIONS.includes(t);
}

/** A tip belongs in the production pool unless it is gated staging (ADR 014). */
export function isProductionTip(tip: Pick<Tip, 'status'>): boolean {
  return tip.status === 'published';
}
