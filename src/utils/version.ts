/**
 * Single-source version lookup. Reads `package.json` at the repo root once and
 * caches the value. Used by the boot-time version-announcer (plan 010), the
 * `notified_version` migration backfill, and the `/help` footer.
 *
 * The file is read with `fs` rather than imported so TypeScript's `rootDir`
 * restriction doesn't need relaxing. Resolves relative to `__dirname`, which
 * works both under `tsx` (src/utils/version.ts) and after compilation
 * (dist/utils/version.js) — both are two levels below the repo root.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

let cached: string | null = null;

export function getVersion(): string {
  if (cached !== null) return cached;
  const pkgPath = join(__dirname, '..', '..', 'package.json');
  const raw = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown };
  if (typeof raw.version !== 'string' || raw.version.length === 0) {
    throw new Error('package.json is missing a string `version` field');
  }
  cached = raw.version;
  return cached;
}

/** Test-only hook — clears the cache between runs. */
export function __resetVersionCacheForTests(): void {
  cached = null;
}
