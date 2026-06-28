/**
 * /changelog tests (plan 010). Covers the plaintext renderer (descending
 * semver order, AnnouncementMessage handling, CTA stripping, Telegram size-cap
 * regression guard, empty state) and the handler (replies with the rendered
 * body via the plaintext reply path).
 */

import { describe, expect, it } from 'vitest';
import type { Context, Telegraf } from 'telegraf';

import type { AnnouncementMessage } from '../../services/notifier';
import { messages } from '../messages';
import { registerChangelogCommand, runChangelogEntry } from './changelog';

const TELEGRAM_REPLY_CAP = 3800;

describe('messages.changelog.render', () => {
  it('sorts versions descending by semver, not lexicographically', () => {
    const announcements: Record<string, string | AnnouncementMessage> = {
      '0.2.0': 'два',
      '0.10.0': 'десять',
      '0.13.0': 'тринадцать',
    };
    const out = messages.changelog.render(announcements);
    const idx13 = out.indexOf('▸ 0.13.0');
    const idx10 = out.indexOf('▸ 0.10.0');
    const idx2 = out.indexOf('▸ 0.2.0');
    expect(idx13).toBeGreaterThanOrEqual(0);
    expect(idx10).toBeGreaterThan(idx13);
    expect(idx2).toBeGreaterThan(idx10);
  });

  it('extracts body from AnnouncementMessage entries and accepts plain strings', () => {
    const announcements: Record<string, string | AnnouncementMessage> = {
      '0.1.0': 'строка',
      '0.2.0': { body: 'объект', cta: { kind: 'open-herb', herbId: 'x' } },
    };
    const out = messages.changelog.render(announcements);
    expect(out).toContain('строка');
    expect(out).toContain('объект');
    // CTA must not leak into the rendered output.
    expect(out).not.toContain('open-herb');
    expect(out).not.toContain('herbId');
  });

  it('uses plaintext headers (no <b> markup, ADR 002)', () => {
    const out = messages.changelog.render({ '0.1.0': 'привет' });
    expect(out).toContain('▸ 0.1.0');
    expect(out).not.toContain('<b>');
  });

  it('renders empty-state header when the map is empty', () => {
    const out = messages.changelog.render({});
    expect(out).toContain(messages.changelog.header);
    expect(out).toContain(messages.changelog.empty);
  });

  it('current versionAnnouncements stays under the Telegram reply cap', () => {
    const out = messages.changelog.render(messages.versionAnnouncements);
    expect(out.length).toBeLessThan(TELEGRAM_REPLY_CAP);
  });

  it('truncates older entries with a marker when the budget would overflow', () => {
    // Build well over the budget so truncation must kick in.
    const announcements: Record<string, string> = {};
    for (let i = 1; i <= 60; i++) {
      announcements[`0.${i}.0`] = 'x'.repeat(120);
    }
    const out = messages.changelog.render(announcements);
    expect(out.length).toBeLessThan(TELEGRAM_REPLY_CAP);
    expect(out).toContain('… (более ранние версии скрыты)');
  });
});

describe('/changelog handler', () => {
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

  it('replies with the rendered changelog body', async () => {
    const { ctx, replies } = makeCtx();
    await runChangelogEntry(ctx);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toBe(messages.changelog.render(messages.versionAnnouncements));
  });

  it('registers a `changelog` command handler', () => {
    const registered: string[] = [];
    const stub = {
      command: (name: string) => {
        registered.push(name);
      },
    } as unknown as Telegraf;
    registerChangelogCommand(stub);
    expect(registered).toContain('changelog');
  });
});
