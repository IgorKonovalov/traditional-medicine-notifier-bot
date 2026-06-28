/**
 * Persistent session store backed by SQLite.
 *
 * Sessions are stored as JSON blobs in `bot_sessions`. The in-memory TTLMap is
 * the hot-path cache; SQLite is the persistence layer that survives restarts.
 * `PersistentTTLMap<V>` writes through to SQLite on `set` and falls back to
 * SQLite on `get` cache misses.
 *
 * SQLite CRUD lives in `src/db/repositories/session.repo.ts` (ADR 003 keeps DB
 * access out of the bot adapter); this module is the bot-layer wrapper plus the
 * `SessionKind` type so handlers depend on a single import.
 */

import {
  deleteExpiredSessionRows,
  deleteSessionRow,
  loadSessionRow,
  saveSessionRow,
} from '../db/repositories/session.repo';

import { TTLMap, type TTLMapOptions } from './state-manager';

/**
 * Default lifetime for an anchor-edit drilldown session. Long enough that a user
 * reading a herb card and tapping back stays live; short enough that abandoned
 * anchors expire and stale taps no-op (ADR 009).
 */
export const SESSION_TTL_MS = 30 * 60 * 1000;

/** Multi-step flows that persist a session. Extend as commands are built. */
export type SessionKind =
  | 'onboarding'
  | 'search'
  | 'library'
  | 'reminders'
  | 'reminder-create'
  | 'settings'
  | 'feedback';

/** Every `SessionKind`, for bulk operations like menu-tap disposal. */
export const SESSION_KINDS: readonly SessionKind[] = [
  'onboarding',
  'search',
  'library',
  'reminders',
  'reminder-create',
  'settings',
  'feedback',
];

/**
 * Drop every persisted session for a user. The navigation spine calls this on a
 * menu tap so a half-finished drilldown can't leave an orphan anchor bound to a
 * stale `message_id` (ADR 009 — menu taps dispose sessions, defense in depth).
 */
export function disposeAllSessions(userId: number): void {
  for (const kind of SESSION_KINDS) deleteSession(userId, kind);
}

/**
 * The persisted shape of an anchor-edit drilldown session (ADR 009): the
 * `message_id` of the single message the flow edits in place, plus the
 * per-flow `state`. The callback prologue checks the tapped message against
 * `anchor.messageId` before handing `state` to a handler.
 */
export interface AnchoredSession<S = unknown> {
  readonly anchor: { readonly messageId: number };
  readonly state: S;
}

export function saveSession(userId: number, kind: SessionKind, data: unknown, ttlMs: number): void {
  saveSessionRow(userId, kind, JSON.stringify(data), Date.now() + ttlMs);
}

export function loadSession<T>(userId: number, kind: SessionKind): T | null {
  const dataJson = loadSessionRow(userId, kind);
  return dataJson === null ? null : (JSON.parse(dataJson) as T);
}

export function deleteSession(userId: number, kind: SessionKind): void {
  deleteSessionRow(userId, kind);
}

/** Bulk-delete expired rows. Called at boot and on a periodic sweep. */
export function deleteExpiredSessions(): number {
  return deleteExpiredSessionRows();
}

export interface PersistentTTLMapOptions<V = unknown> extends TTLMapOptions<number, V> {
  kind: SessionKind;
}

/**
 * TTLMap with SQLite write-through and read-fallback.
 *
 * - `set()` writes to both memory and SQLite.
 * - `get()` checks memory first; on miss, loads from SQLite and warms the cache.
 * - `delete()` removes from both.
 * - `dispose()` clears memory and stops the sweeper; SQLite rows survive.
 */
export class PersistentTTLMap<V> {
  private readonly memory: TTLMap<number, V>;
  private readonly kind: SessionKind;
  private readonly ttlMs: number;

  constructor(options: PersistentTTLMapOptions<V>) {
    this.memory = new TTLMap<number, V>(options);
    this.kind = options.kind;
    this.ttlMs = options.ttlMs;
  }

  set(key: number, value: V): void {
    this.memory.set(key, value);
    saveSession(key, this.kind, value, this.ttlMs);
  }

  get(key: number): V | undefined {
    const cached = this.memory.get(key);
    if (cached !== undefined) return cached;
    const stored = loadSession<V>(key, this.kind);
    if (stored !== null) {
      this.memory.set(key, stored);
      return stored;
    }
    return undefined;
  }

  has(key: number): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: number): void {
    this.memory.delete(key);
    deleteSession(key, this.kind);
  }

  dispose(): void {
    this.memory.dispose();
  }
}
