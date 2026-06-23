/**
 * In-memory TTL map for short-lived per-user flow state (multi-step command
 * sessions). Entries expire after `ttlMs`; a background sweeper evicts stale
 * keys. A hard `maxEntries` bound guards against unbounded growth.
 *
 * This is the hot-path cache only. Durable session state that must survive a
 * restart goes through `session-store.ts` (SQLite write-through).
 */

export interface TTLMapOptions<K, V> {
  ttlMs: number;
  /** Hard cap on live entries; oldest are evicted past this. Default 5000. */
  maxEntries?: number;
  /** Sweep cadence in ms. Default 60_000. */
  sweepIntervalMs?: number;
  /** Optional eviction callback, fired on expiry/eviction. */
  onEvict?: (key: K, value: V) => void;
}

interface Entry<V> {
  value: V;
  expiresAt: number;
}

const DEFAULT_MAX_ENTRIES = 5000;
const DEFAULT_SWEEP_MS = 60_000;

export class TTLMap<K, V> {
  private readonly map = new Map<K, Entry<V>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly onEvict: ((key: K, value: V) => void) | undefined;
  private readonly sweeper: ReturnType<typeof setInterval>;

  constructor(options: TTLMapOptions<K, V>) {
    this.ttlMs = options.ttlMs;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.onEvict = options.onEvict;
    this.sweeper = setInterval(() => this.sweep(), options.sweepIntervalMs ?? DEFAULT_SWEEP_MS);
    (this.sweeper as { unref?: () => void }).unref?.();
  }

  set(key: K, value: V): void {
    if (this.map.size >= this.maxEntries && !this.map.has(key)) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.evict(oldest);
    }
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.evict(key);
      return undefined;
    }
    return entry.value;
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): void {
    this.map.delete(key);
  }

  /** Stops the sweeper. Call on shutdown so the process can exit cleanly. */
  dispose(): void {
    clearInterval(this.sweeper);
    this.map.clear();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.map) {
      if (entry.expiresAt <= now) this.evict(key);
    }
  }

  private evict(key: K): void {
    const entry = this.map.get(key);
    this.map.delete(key);
    if (entry !== undefined && this.onEvict !== undefined) {
      this.onEvict(key, entry.value);
    }
  }
}
