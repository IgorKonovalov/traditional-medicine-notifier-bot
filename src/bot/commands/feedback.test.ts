import { describe, expect, it } from 'vitest';

import { messages } from '../messages';

describe('messages.feedback.adminRelay', () => {
  it('tags the message with the internal user id and preserves the body', () => {
    const out = messages.feedback.adminRelay(42, 'Отличный бот, спасибо!');
    expect(out).toContain('#42');
    expect(out).toContain('Отличный бот, спасибо!');
  });

  it('keeps a multi-line body intact', () => {
    const out = messages.feedback.adminRelay(7, 'Строка один\nСтрока два');
    expect(out).toContain('Строка один\nСтрока два');
  });
});
