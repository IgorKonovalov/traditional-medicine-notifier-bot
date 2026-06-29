/**
 * Per-user recent-tip history for the on-demand tip surfaces (Plan 021).
 *
 * A small in-memory ring buffer of the last few tip ids each user was shown on
 * demand, so consecutive taps of `💡 Советы` / `/tips` / the library
 * `💡 Случайный совет` leaf don't immediately repeat. Keyed by internal
 * `user_id` (ADR 003).
 *
 * Deliberately non-persistent: the value is a soft UX nicety, not durable state.
 * Losing it on restart is harmless (at worst one early repeat after a redeploy),
 * and keeping it in-memory avoids a DB migration. Single-process only — if the
 * bot is ever horizontally scaled this becomes per-instance (see Plan 021 Risks).
 */

/**
 * How many recently-shown tips to remember (and exclude) per user. Kept small so
 * the exclusion is a "don't repeat the last few" nicety rather than a long lock —
 * `pickRandomTip` clamps against the live pool, so a corpus smaller than the
 * window still always has something to show.
 */
export const HISTORY_WINDOW = 8;

const recentByUser = new Map<number, string[]>();

/** The set of tip ids this user was shown most recently (newest-last). */
export function getRecent(userId: number): ReadonlySet<string> {
  return new Set(recentByUser.get(userId) ?? []);
}

/**
 * Record that `tipId` was shown to `userId`, evicting the oldest id once the
 * buffer exceeds {@link HISTORY_WINDOW}.
 */
export function recordShown(userId: number, tipId: string): void {
  const buffer = recentByUser.get(userId) ?? [];
  buffer.push(tipId);
  while (buffer.length > HISTORY_WINDOW) buffer.shift();
  recentByUser.set(userId, buffer);
}

/** Drop all recorded history. Test-only — keeps cases isolated. */
export function _resetTipHistory(): void {
  recentByUser.clear();
}
