import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadContent } from '../../content/loader';

import { pickDailyTip } from './tips';

/**
 * Proves the tip-staging gate (ADR 014) at the consumer: a `status: staging`
 * tip loaded on the production path is never in the rotation pool, so
 * `pickDailyTip` can never serve it. Uses the real fs walk (no mocks), like the
 * boot loader.
 */
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function writeTips(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'tmnb-tips-'));
  dirs.push(root);
  const dir = join(root, 'tips');
  mkdirSync(dir, { recursive: true });
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(dir, `${name}.md`), contents);
  }
  return root;
}

const PUBLISHED = `---
id: tip-published
---

Обычный совет дня.
`;

const STAGING = `---
id: tip-staging
status: staging
---

Заметка с показанием при болезни (gated).
`;

describe('pickDailyTip — tip-staging gate (ADR 014)', () => {
  it('never serves a staging tip on the production path', () => {
    const root = writeTips({ 'tip-published': PUBLISHED, 'tip-staging': STAGING });
    const pool = loadContent(root).tips.all;

    expect(pool.every((t) => t.status === 'published')).toBe(true);
    const picked = pickDailyTip(pool);
    expect(picked?.id).toBe('tip-published');
  });

  it('returns null for an empty pool', () => {
    expect(pickDailyTip([])).toBeNull();
  });
});
