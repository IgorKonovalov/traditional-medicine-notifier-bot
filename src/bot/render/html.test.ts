import type { Context } from 'telegraf';
import { describe, expect, it } from 'vitest';

import { editHtml, html, replyHtml, unsafeHtml } from './html';

describe('html tagged template', () => {
  it('auto-escapes every interpolated value', () => {
    const out = html`<b>${'<script> & "x"'}</b>`;
    expect(out).toBe('<b>&lt;script&gt; &amp; &quot;x&quot;</b>');
  });

  it('trusts static template parts but escapes interpolations only', () => {
    const name = 'Агар & <8>';
    expect(html`🧪 <b>${name}</b>`).toBe('🧪 <b>Агар &amp; &lt;8&gt;</b>');
  });

  it('re-escapes a nested Html value (no pass-through — defence in depth)', () => {
    const inner = html`<i>x</i>`;
    expect(html`${inner}`).toBe('&lt;i&gt;x&lt;/i&gt;');
  });

  it('stringifies non-string interpolations before escaping', () => {
    expect(html`n=${5}`).toBe('n=5');
  });
});

describe('unsafeHtml', () => {
  it('returns the string verbatim (caller asserts safety)', () => {
    expect(unsafeHtml('<b>safe</b>')).toBe('<b>safe</b>');
  });
});

describe('replyHtml / editHtml', () => {
  it('replyHtml sends with parse_mode HTML and merges extra', async () => {
    let body: string | undefined;
    let extra: Record<string, unknown> | undefined;
    const ctx = {
      reply: (b: string, e: Record<string, unknown>): Promise<{ message_id: number }> => {
        body = b;
        extra = e;
        return Promise.resolve({ message_id: 1 });
      },
    } as unknown as Context;

    await replyHtml(ctx, html`<b>hi</b>`, { reply_markup: { inline_keyboard: [] } });
    expect(body).toBe('<b>hi</b>');
    expect(extra).toMatchObject({ parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } });
  });

  it('editHtml edits with parse_mode HTML', async () => {
    let extra: Record<string, unknown> | undefined;
    const ctx = {
      editMessageText: (_b: string, e: Record<string, unknown>): Promise<boolean> => {
        extra = e;
        return Promise.resolve(true);
      },
    } as unknown as Context;

    await editHtml(ctx, html`<i>x</i>`);
    expect(extra).toMatchObject({ parse_mode: 'HTML' });
  });
});
