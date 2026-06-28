import type { Context } from 'telegraf';
import { describe, expect, it } from 'vitest';

import { editAnchor, sendAnchor } from './anchor';

describe('sendAnchor', () => {
  it('sends the body and returns the new message id', async () => {
    let sent: string | undefined;
    const ctx = {
      reply: (text: string): Promise<{ message_id: number }> => {
        sent = text;
        return Promise.resolve({ message_id: 555 });
      },
    } as unknown as Context;

    const anchor = await sendAnchor(ctx, 'Привет');
    expect(anchor).toEqual({ messageId: 555 });
    expect(sent).toBe('Привет');
  });
});

describe('editAnchor', () => {
  function rejectingCtx(err: unknown): Context {
    return { editMessageText: (): Promise<never> => Promise.reject(err) } as unknown as Context;
  }

  it('edits the anchor in place', async () => {
    let edited: string | undefined;
    const ctx = {
      editMessageText: (text: string): Promise<boolean> => {
        edited = text;
        return Promise.resolve(true);
      },
    } as unknown as Context;
    await editAnchor(ctx, 'Обновление');
    expect(edited).toBe('Обновление');
  });

  it('swallows Telegram 400 "message is not modified"', async () => {
    const ctx = rejectingCtx({
      response: { error_code: 400, description: 'Bad Request: message is not modified' },
    });
    await expect(editAnchor(ctx, 'same')).resolves.toBeUndefined();
  });

  it('rethrows any other failure', async () => {
    const ctx = rejectingCtx({
      response: { error_code: 403, description: 'Forbidden: bot was blocked by the user' },
    });
    await expect(editAnchor(ctx, 'x')).rejects.toMatchObject({ response: { error_code: 403 } });
  });
});
