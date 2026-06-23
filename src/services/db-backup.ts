/**
 * Daily SQLite backup with rotation.
 *
 * Uses better-sqlite3's online `Database#backup` API (no read-lock contention)
 * to copy the live DB into `BACKUP_DIR/tm-bot-YYYY-MM-DD.db`. Keeps the most
 * recent N files; older ones are deleted in the same pass.
 */

import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { getDb } from '../db/connection';
import { getLogger } from '../logger';
import { formatDate } from '../utils/datetime';

export interface BackupOptions {
  backupDir: string;
  /** How many daily backups to keep. Older ones get rotated out. */
  retentionDays?: number;
  /** Reference timestamp for the dated filename. */
  now?: number;
  /** Timezone for the dated filename — should match the bot timezone. */
  timezone?: string;
}

const FILENAME_PREFIX = 'tm-bot-';
const FILENAME_SUFFIX = '.db';

export async function runBackup(options: BackupOptions): Promise<string> {
  const retention = options.retentionDays ?? 14;
  const now = options.now ?? Date.now();
  const timezone = options.timezone ?? 'UTC';
  const log = getLogger();

  ensureDir(options.backupDir);

  const dateStr = formatDate(now, timezone);
  const target = join(options.backupDir, `${FILENAME_PREFIX}${dateStr}${FILENAME_SUFFIX}`);

  try {
    await getDb().backup(target);
  } catch (err) {
    log.warn({ err, target }, 'db backup failed');
    return target;
  }
  log.info({ target }, 'db backup completed');

  rotate(options.backupDir, retention, log);
  return target;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function rotate(dir: string, keep: number, log: ReturnType<typeof getLogger>): void {
  const entries = readdirSync(dir)
    .filter((name) => name.startsWith(FILENAME_PREFIX) && name.endsWith(FILENAME_SUFFIX))
    .map((name) => {
      const path = join(dir, name);
      return { name, path, mtime: statSync(path).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  for (const entry of entries.slice(keep)) {
    try {
      unlinkSync(entry.path);
      log.info({ removed: entry.path }, 'rotated old backup');
    } catch (err) {
      log.warn({ err, path: entry.path }, 'failed to remove old backup');
    }
  }
}
