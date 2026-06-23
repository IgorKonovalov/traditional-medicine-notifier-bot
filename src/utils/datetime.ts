/**
 * Timezone-aware date helpers. Pure (uses only `Intl`, no Node APIs) so the
 * proactive-push daily cap, the dispatch tick, and the dated backup filename
 * all share one definition of "what local day / hour is it".
 */

/**
 * Local calendar date as `YYYY-MM-DD` in the given IANA timezone. The `en-CA`
 * locale formats dates in ISO order, so this is a stable key for the
 * "one proactive push per calendar day" cap and the backup filename.
 */
export function formatDate(now: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));
}

/**
 * Local hour (0–23) in the given timezone. Used by the dispatch tick to match
 * a user's chosen reminder hour against the current local hour.
 */
export function hourOfDay(now: number, timeZone: string): number {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  }).format(new Date(now));
  // en-GB can render midnight as "24"; normalize to 0.
  return Number(formatted) % 24;
}
