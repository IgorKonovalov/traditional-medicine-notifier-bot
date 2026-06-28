import { describe, expect, it } from 'vitest';

import { clampToTelegram, toPlainText } from './markdown';

describe('toPlainText', () => {
  it('joins soft-wrap newlines within a paragraph and preserves paragraph breaks', () => {
    const input =
      'Тибетская традиция соотносит количество пищи\n' +
      'с сезоном. Зимой едят обильнее\n' +
      'и сытнее.\n' +
      '\n' +
      'В основе лежит простая мысль: одна и та же\n' +
      'порция по-разному ложится зимой и летом.';

    const out = toPlainText(input);

    // (a) soft-wrap newlines collapse to single spaces
    expect(out).toContain('количество пищи с сезоном');
    expect(out).toContain('Зимой едят обильнее и сытнее');
    expect(out).toContain('одна и та же порция');
    // (b) the blank-line paragraph break survives
    expect(out).toContain('и сытнее.\n\nВ основе');
    // no stray double spaces introduced
    expect(out).not.toMatch(/ {2}/);
  });

  it('collapses runs of 3+ newlines to a single blank line', () => {
    expect(toPlainText('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('strips headings, emphasis, and link syntax', () => {
    expect(toPlainText('# Заголовок')).toBe('Заголовок');
    expect(toPlainText('**жирный** и *курсив* и _подчёркнутый_')).toBe(
      'жирный и курсив и подчёркнутый',
    );
    expect(toPlainText('текст с `кодом`')).toBe('текст с кодом');
    expect(toPlainText('[ссылка](https://example.com)')).toBe('ссылка');
  });
});

describe('clampToTelegram', () => {
  it('leaves short text unchanged', () => {
    expect(clampToTelegram('короткий текст')).toBe('короткий текст');
  });

  it('truncates overlong text on a word boundary with an ellipsis', () => {
    const long = 'слово '.repeat(1000).trim();
    const out = clampToTelegram(long);
    expect(out.length).toBeLessThanOrEqual(3801);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/слов…$/); // cut at a space, not mid-word
  });
});
