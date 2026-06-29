import { describe, expect, it } from 'vitest';

import type { Guide } from '../../content/types';
import { messages } from '../messages';
import { TELEGRAM_LIMIT } from '../render/markdown';

import { guidePages, renderGuideSection } from './_guide-card';

function guide(sections: Guide['sections']): Guide {
  return { id: 'g', tradition: 'tibetan', title: 'Статья', tags: [], sections };
}

describe('renderGuideSection', () => {
  it('renders an intro (no heading) as the body alone', () => {
    expect(renderGuideSection({ heading: '', body: 'Здоровье — равновесие.' })).toBe(
      'Здоровье — равновесие.',
    );
  });

  it('renders a headed section as heading then body, stripping markdown', () => {
    expect(renderGuideSection({ heading: 'Ветер', body: 'Природа **прохладная**.' })).toBe(
      'Ветер\n\nПрирода прохладная.',
    );
  });
});

describe('guidePages', () => {
  it('produces one page per section and appends the disclaimer to the last page only', () => {
    const pages = guidePages(
      guide([
        { heading: '', body: 'Вступление.' },
        { heading: 'Раздел', body: 'Текст раздела.' },
      ]),
    );

    expect(pages).toHaveLength(2);
    expect(pages[0]).toBe('Вступление.');
    expect(pages[0]).not.toContain(messages.disclaimer);
    expect(pages[1]).toBe(`Раздел\n\nТекст раздела.\n\n${messages.disclaimer}`);
  });

  it('keeps every page within the Telegram limit, splitting an oversized section', () => {
    const huge = 'слово '.repeat(1400).trimEnd(); // ~8400 chars, one section
    const pages = guidePages(guide([{ heading: 'Большой', body: huge }]));

    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) expect(page.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
    // The disclaimer rides the final page.
    expect(pages[pages.length - 1]).toContain(messages.disclaimer);
  });
});
