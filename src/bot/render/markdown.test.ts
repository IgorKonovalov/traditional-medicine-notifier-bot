import { describe, expect, it } from 'vitest';

import { clampToTelegram, splitForTelegram, TELEGRAM_LIMIT, toPlainText } from './markdown';

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

describe('splitForTelegram', () => {
  /** A paragraph of `n` characters made of whole words (so word-boundary cuts exist). */
  const para = (n: number): string =>
    'слово '
      .repeat(Math.ceil(n / 6))
      .slice(0, n)
      .trimEnd();

  it('returns a single chunk when the text is within the limit', () => {
    expect(splitForTelegram('короткая статья')).toEqual(['короткая статья']);
  });

  it('returns a single chunk at exactly the limit', () => {
    const exact = 'a'.repeat(TELEGRAM_LIMIT);
    expect(splitForTelegram(exact)).toEqual([exact]);
  });

  it('packs multiple paragraphs into as few chunks as possible, each within the limit', () => {
    // Four ~1500-char paragraphs: two fit per chunk (2×1500 + 2 < 3800), so 2 chunks.
    const paragraphs = [para(1500), para(1500), para(1500), para(1500)];
    const chunks = splitForTelegram(paragraphs.join('\n\n'));

    expect(chunks.length).toBe(2);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
    // Order and content are preserved (modulo the whitespace at split seams).
    expect(chunks.join('\n\n').replace(/\s+/g, ' ')).toBe(
      paragraphs.join('\n\n').replace(/\s+/g, ' '),
    );
  });

  it('keeps each paragraph whole when it fits, breaking before an oversized join', () => {
    const chunks = splitForTelegram([para(3000), para(3000)].join('\n\n'));
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe(para(3000));
    expect(chunks[1]).toBe(para(3000));
  });

  it('splits a single oversized paragraph on word boundaries, losing nothing', () => {
    const huge = para(9000); // one paragraph, no blank lines
    const chunks = splitForTelegram(huge);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
      expect(chunk.endsWith(' ')).toBe(false); // trimmed at the seam
    }
    // No ellipsis, and every word survives the round-trip.
    expect(chunks.join(' ')).toBe(huge);
  });

  it('cuts a single word longer than the limit as a last resort', () => {
    const monolith = 'x'.repeat(TELEGRAM_LIMIT + 500);
    const chunks = splitForTelegram(monolith);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.length).toBe(TELEGRAM_LIMIT);
    expect(chunks.join('')).toBe(monolith);
  });

  it('counts multi-byte/emoji content by string length and keeps chunks within the limit', () => {
    const emojiParagraph = '🌿 трава '.repeat(700); // well over the limit
    const chunks = splitForTelegram(emojiParagraph.trimEnd());
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
  });
});
