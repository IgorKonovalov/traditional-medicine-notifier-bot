/**
 * Pure recurrence math: given a `RecurrenceSpec`, the timezone, and an instant,
 * compute the next epoch-ms a reminder should fire. No Node, no DB — trivially
 * unit-testable and reusable by a future shared package.
 *
 * `times` in a spec are local `HH:MM` wall-clock strings interpreted in the bot
 * timezone. Day boundaries and DST transitions are handled via `Intl`, so a
 * "08:00 daily" reminder fires at 08:00 local even across a clock change.
 *
 * NOTE (skeleton): the `interval` cycle is anchored at the day of `after`
 * rather than at the reminder's creation date — a deliberate simplification to
 * flag when real scheduling logic is implemented. See docs/plans/ (TBD).
 */

import type { RecurrenceSpec } from './types';

const MS_PER_DAY = 86_400_000;
const SEARCH_HORIZON_DAYS = 366; // guarantees a hit for any weekly/interval spec

/**
 * Next fire instant strictly after `after`, or `null` when the spec never fires
 * again (a `once` reminder, or an empty schedule).
 */
export function computeNextFire(
  spec: RecurrenceSpec,
  after: number,
  timeZone: string,
): number | null {
  if (spec.kind === 'once') return null;

  const times = [...spec.times].filter(isValidTime).sort();
  if (times.length === 0) return null;

  const baseDate = formatLocalDate(after, timeZone);

  for (let dayOffset = 0; dayOffset <= SEARCH_HORIZON_DAYS; dayOffset++) {
    const dateStr = addDays(baseDate, dayOffset);
    if (!dayMatches(spec, dateStr, baseDate, dayOffset)) continue;
    for (const time of times) {
      const epoch = zonedWallTimeToEpoch(dateStr, time, timeZone);
      if (epoch > after) return epoch;
    }
  }
  return null;
}

function dayMatches(
  spec: RecurrenceSpec,
  dateStr: string,
  baseDate: string,
  dayOffset: number,
): boolean {
  switch (spec.kind) {
    case 'daily':
      return true;
    case 'weekly':
      return spec.weekdays.includes(weekdayOf(dateStr));
    case 'interval':
      return spec.everyDays > 0 && dayOffset % spec.everyDays === 0 && dateStr >= baseDate;
    default:
      return false;
  }
}

// ─── helpers (pure, Intl-only) ────────────────────────────────────────────────

function isValidTime(t: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

/** Local calendar date `YYYY-MM-DD` for an instant in a timezone. */
export function formatLocalDate(epoch: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(epoch));
}

/** Add `n` days to a `YYYY-MM-DD` string (anchored at UTC noon to dodge DST). */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  const base = Date.UTC(y, m - 1, d, 12) + n * MS_PER_DAY;
  const dt = new Date(base);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Weekday of a `YYYY-MM-DD` string: 0=Sunday … 6=Saturday. */
function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Epoch-ms for a local wall-clock time (`YYYY-MM-DD` + `HH:MM`) in a timezone.
 * Two-pass offset correction resolves DST transitions.
 */
export function zonedWallTimeToEpoch(dateStr: string, hhmm: string, timeZone: string): number {
  const [y, mo, d] = dateStr.split('-').map(Number) as [number, number, number];
  const [h, mi] = hhmm.split(':').map(Number) as [number, number];
  const wallAsUTC = Date.UTC(y, mo - 1, d, h, mi);
  const offset1 = tzOffsetMs(wallAsUTC, timeZone);
  let epoch = wallAsUTC - offset1;
  const offset2 = tzOffsetMs(epoch, timeZone);
  if (offset2 !== offset1) epoch = wallAsUTC - offset2;
  return epoch;
}

/** Timezone offset (ms east of UTC) in effect at `epoch` for the given zone. */
function tzOffsetMs(epoch: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(epoch));
  const map: Record<string, number> = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = Number(p.value);
  const hour = map['hour'] === 24 ? 0 : (map['hour'] ?? 0);
  const wallAsUTC = Date.UTC(
    map['year'] ?? 1970,
    (map['month'] ?? 1) - 1,
    map['day'] ?? 1,
    hour,
    map['minute'] ?? 0,
    map['second'] ?? 0,
  );
  return wallAsUTC - epoch;
}
