/**
 * Shared guide rendering (Plan 006, ADR 008). A guide is read one *page* at a
 * time: each authored section renders to plain text and is packed/split into
 * ≤-limit pages by the sanctioned `splitForTelegram` (so an over-long section
 * still pages cleanly inside the anchor-edit model). Guides carry no render-time
 * disclaimer — as of 2026-06-29 it is scoped to the formula card + /start +
 * /help only (amends ADR 006 #2/#4).
 *
 * Kept beside the library flow (mirroring `_herb-card`/`_formula-card`) rather
 * than in `render/markdown.ts`, which stays free of content-type imports.
 */

import type { Guide, GuideSection } from '../../content/types';
import { splitForTelegram, toPlainText } from '../render/markdown';

/** A section as plain text: its heading (if any) followed by the body prose. */
export function renderGuideSection(section: GuideSection): string {
  const body = toPlainText(section.body);
  if (section.heading === '') return body;
  if (body === '') return section.heading;
  return `${section.heading}\n\n${body}`;
}

/**
 * Flatten a guide into the ordered list of ≤-limit pages the pager steps
 * through. Sections are rendered in order. Each entry is safe to send/edit as-is.
 */
export function guidePages(guide: Guide): string[] {
  const pages: string[] = [];
  for (const section of guide.sections) {
    pages.push(...splitForTelegram(renderGuideSection(section)));
  }
  return pages;
}
