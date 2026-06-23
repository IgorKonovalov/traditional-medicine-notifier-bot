/**
 * Exponential backoff with explicit handling for Telegram's 429 retry-after.
 *
 * Telegraf surfaces rate-limit errors with a `parameters.retry_after` field
 * (seconds). When we see one, we honor that delay exactly instead of falling
 * back to plain exponential growth — Telegram's value is authoritative.
 *
 * Generic enough to wrap any async call. Pure logic, no Telegraf import, so
 * domain code can use it too.
 */

export interface RetryOptions {
  /** Maximum number of attempts (including the first). */
  attempts?: number;
  /** Base delay in ms; doubled on each retry. */
  baseDelayMs?: number;
  /** Cap on the per-retry delay. */
  maxDelayMs?: number;
  /** Test seam; defaults to a real `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULTS: Required<Omit<RetryOptions, 'sleep'>> & { sleep: (ms: number) => Promise<void> } = {
  attempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const opts = { ...DEFAULTS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt < opts.attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLast = attempt === opts.attempts - 1;
      if (isLast) break;
      const delay = computeDelay(err, attempt, opts.baseDelayMs, opts.maxDelayMs);
      await opts.sleep(delay);
    }
  }

  throw lastError;
}

function computeDelay(err: unknown, attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const retryAfterSec = extractRetryAfter(err);
  if (retryAfterSec !== null) {
    return Math.min(retryAfterSec * 1000, maxDelayMs);
  }
  return Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
}

/**
 * Pulls `retry_after` (seconds) from a Telegram-style error envelope. Returns
 * `null` for any error that does not look like a rate-limit response.
 */
function extractRetryAfter(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  const maybe = err as { parameters?: { retry_after?: unknown } };
  const value = maybe.parameters?.retry_after;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
