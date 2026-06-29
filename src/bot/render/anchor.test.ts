import type { Context } from 'telegraf';
import { describe, expect, it } from 'vitest';

import { editAnchor, editAnchorHtml, sendAnchor, sendAnchorHtml } from './anchor';
import { unsafeHtml } from './html';

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

describe('sendAnchorHtml', () => {
  it('sends the HTML body with parse_mode HTML and returns the message id', async () => {
    let body: string | undefined;
    let extra: Record<string, unknown> | undefined;
    const ctx = {
      reply: (b: string, e: Record<string, unknown>): Promise<{ message_id: number }> => {
        body = b;
        extra = e;
        return Promise.resolve({ message_id: 777 });
      },
    } as unknown as Context;

    const anchor = await sendAnchorHtml(ctx, unsafeHtml('<b>Привет</b>'));
    expect(anchor).toEqual({ messageId: 777 });
    expect(body).toBe('<b>Привет</b>');
    expect(extra).toMatchObject({ parse_mode: 'HTML' });
  });
});

describe('editAnchorHtml', () => {
  it('edits with parse_mode HTML', async () => {
    let extra: Record<string, unknown> | undefined;
    const ctx = {
      editMessageText: (_b: string, e: Record<string, unknown>): Promise<boolean> => {
        extra = e;
        return Promise.resolve(true);
      },
    } as unknown as Context;
    await editAnchorHtml(ctx, unsafeHtml('<i>x</i>'));
    expect(extra).toMatchObject({ parse_mode: 'HTML' });
  });

  it('swallows the benign "message is not modified" 400', async () => {
    const ctx = {
      editMessageText: (): Promise<never> =>
        Promise.reject({
          response: { error_code: 400, description: 'Bad Request: message is not modified' },
        }),
    } as unknown as Context;
    await expect(editAnchorHtml(ctx, unsafeHtml('<b>same</b>'))).resolves.toBeUndefined();
  });
});
