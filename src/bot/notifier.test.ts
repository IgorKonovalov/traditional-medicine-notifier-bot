import { describe, expect, it } from 'vitest';

import { buildCta } from './notifier';

/** Callback data of the single CTA button the keyboard carries. */
function ctaData(kb: ReturnType<typeof buildCta>): string | undefined {
  const btn = kb.reply_markup.inline_keyboard[0]?.[0] as { callback_data?: string } | undefined;
  return btn?.callback_data;
}

describe('buildCta (plan 024 CTA union)', () => {
  it('renders a herb:<id> callback for an open-herb CTA', () => {
    expect(ctaData(buildCta({ kind: 'open-herb', herbId: 'tib-ginger' }))).toBe('herb:tib-ginger');
  });

  it('renders a formula:<id> callback for an open-formula CTA', () => {
    expect(ctaData(buildCta({ kind: 'open-formula', combinationId: 'tib-formula-agar-8' }))).toBe(
      'formula:tib-formula-agar-8',
    );
  });
});
