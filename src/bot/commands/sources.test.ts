/**
 * /sources tests — the «Об источниках» page. Covers the handler (replies with
 * the plaintext body) and command registration.
 */

import { describe, expect, it } from 'vitest';
import type { Context, Telegraf } from 'telegraf';

import { messages } from '../messages';
import { registerSourcesCommand, runSourcesEntry } from './sources';

describe('/sources handler', () => {
  function makeCtx(): { ctx: Context; replies: string[] } {
    const replies: string[] = [];
    const ctx = {
      reply: (text: string): Promise<unknown> => {
        replies.push(text);
        return Promise.resolve({ message_id: 1 });
      },
    } as unknown as Context;
    return { ctx, replies };
  }

  it('replies with the sources body', async () => {
    const { ctx, replies } = makeCtx();
    await runSourcesEntry(ctx);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toBe(messages.sources.body);
  });

  it('names the core texts and stays plaintext (ADR 002)', () => {
    expect(messages.sources.body).toContain('Чжуд-ши');
    expect(messages.sources.body).toContain('Сова Ригпа');
    expect(messages.sources.body).toContain('manla.ru');
    expect(messages.sources.body).not.toContain('<b>');
  });

  it('registers a `sources` command handler', () => {
    const registered: string[] = [];
    const stub = {
      command: (name: string) => {
        registered.push(name);
      },
    } as unknown as Telegraf;
    registerSourcesCommand(stub);
    expect(registered).toContain('sources');
  });
});
