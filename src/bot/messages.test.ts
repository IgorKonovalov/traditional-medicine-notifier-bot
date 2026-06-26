import { describe, expect, it } from 'vitest';

import { messages } from './messages';

describe('messages.tip.daily', () => {
  it('appends a source line with all parts present', () => {
    const out = messages.tip.daily('Тело совета.', {
      work: 'Чжуд-ши',
      part: 'Тантра объяснений',
      chapter: 'гл. 18 «Мера питания»',
    });
    expect(out).toBe(
      '🌿 Совет дня\n\nТело совета.\n\nИсточник: «Чжуд-ши», Тантра объяснений, гл. 18 «Мера питания»',
    );
  });

  it('omits absent source parts cleanly (work only)', () => {
    const out = messages.tip.daily('Тело совета.', { work: 'Чжуд-ши' });
    expect(out).toBe('🌿 Совет дня\n\nТело совета.\n\nИсточник: «Чжуд-ши»');
  });

  it('renders no source line and no trailing blank when source is absent', () => {
    const out = messages.tip.daily('Тело совета.');
    expect(out).toBe('🌿 Совет дня\n\nТело совета.');
    expect(out).not.toContain('Источник');
  });
});
