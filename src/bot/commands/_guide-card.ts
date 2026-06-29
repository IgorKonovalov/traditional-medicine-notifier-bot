/**
 * Shared guide rendering (Plan 006, ADR 008). A guide is read one *page* at a
 * time: each authored section renders to plain text and is packed/split into
 * ≤-limit pages by the sanctioned `splitForTelegram` (so an over-long section
 * still pages cleanly inside the anchor-edit model). The render-time disclaimer
 * (ADR 006) is appended to the final section before splitting, so it always
 * lands on the last page and is never clamped away.
 *
 * Kept beside the library flow (mirroring `_herb-card`/`_formula-card`) rather
 * than in `render/markdown.ts`, which stays free of content-type imports.
 */

import type { Guide, GuideSection } from '../../content/types';
import { messages } from '../messages';
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
 * through. Sections are rendered in order; the disclaimer trails the final
 * section. Each entry is safe to send/edit as-is.
 */
export function guidePages(guide: Guide): string[] {
  const lastIndex = guide.sections.length - 1;
  const pages: string[] = [];
  guide.sections.forEach((section, index) => {
    const text =
      index === lastIndex
        ? `${renderGuideSection(section)}\n\n${messages.disclaimer}`
        : renderGuideSection(section);
    pages.push(...splitForTelegram(text));
  });
  return pages;
}
