/**
 * Regenerate (or check) the committed content index under `content/.index/`.
 *
 *   pnpm run content:index             # write herbs.json / categories.json / tips.json
 *   pnpm run content:index:check       # --check --validate: fail on drift, no write
 *
 * `--validate` is implicit in loading: `loadContent` runs corpus validation and
 * throws on a malformed corpus. `--check` rebuilds in memory and diffs against
 * the committed files, exiting 1 on any drift (the CI guard).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadContent } from '../src/content/loader';
import { buildIndex } from '../src/content/index-builders';

const CONTENT_DIR = process.env['CONTENT_DIR'] ?? './content';
const INDEX_DIR = join(CONTENT_DIR, '.index');

function main(): void {
  const args = new Set(process.argv.slice(2));
  const check = args.has('--check');

  // Index the FULL corpus — the visibility gate (ADR 013) hides traditions from
  // the runtime bot, not from the committed index (Chinese files stay indexed).
  const content = loadContent(CONTENT_DIR, { includeHiddenTraditions: true });
  const index = buildIndex(content);

  const files: Record<string, unknown> = {
    'herbs.json': index.herbs,
    'combinations.json': index.combinations,
    'categories.json': index.categories,
    'tips.json': index.tips,
    'guides.json': index.guides,
    'foods.json': index.foods,
  };

  if (check) {
    let drift = false;
    for (const [name, value] of Object.entries(files)) {
      const path = join(INDEX_DIR, name);
      const expected = serialize(value);
      const actual = existsSync(path) ? readFileSync(path, 'utf8') : '';
      if (actual !== expected) {
        console.error(`content index drift: ${path} is stale — run \`pnpm run content:index\``);
        drift = true;
      }
    }
    if (drift) process.exit(1);
    console.log(
      `content index OK (herbs ${index.counts.herbs}, combinations ${index.counts.combinations}, categories ${index.counts.categories}, tips ${index.counts.tips}, guides ${index.counts.guides}, foods ${index.counts.foods})`,
    );
    return;
  }

  if (!existsSync(INDEX_DIR)) mkdirSync(INDEX_DIR, { recursive: true });
  for (const [name, value] of Object.entries(files)) {
    writeFileSync(join(INDEX_DIR, name), serialize(value));
  }
  console.log(
    `content index written (herbs ${index.counts.herbs}, combinations ${index.counts.combinations}, categories ${index.counts.categories}, tips ${index.counts.tips}, guides ${index.counts.guides}, foods ${index.counts.foods})`,
  );
}

function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

main();
