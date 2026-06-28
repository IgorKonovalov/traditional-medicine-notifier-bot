/**
 * Post-deploy version broadcast (plan 010).
 *
 * On boot, after DB init + migrations + content load, this service walks every
 * **active** user whose `notified_version` is stale and sends the Russian
 * announcement strings for every minor/major release that landed between their
 * last notified version and the current one — via the `Notifier` interface so
 * the domain stays Telegraf-free (ADR 003 rule 3).
 *
 * Behaviour ported at full parity from the sibling serbian-language-bot:
 *
 *   1. **Multi-version queue.** A user dormant across N minor releases
 *      receives one message per release in ascending semver order, capped at
 *      the most recent {@link MAX_ANNOUNCEMENTS_PER_USER}. Older entries are
 *      skipped — their content stays discoverable via `/changelog`.
 *   2. **Intra-user delay.** Consecutive sends to the same user are spaced by
 *      {@link INTRA_USER_DELAY_MS} so each lands as its own perceptible
 *      Telegram notification rather than batching into one.
 *   3. **Priority bypass.** Entries with `priority: true` override the
 *      `feature_announcements = '1'` opt-in gate. The opt-out toggle still
 *      filters non-priority entries; the only escape hatch from a priority
 *      send is the user blocking the bot (which flips `active = 0`).
 *
 * Semantics:
 *   - MAJOR or MINOR bump → up to 3 messages per user, oldest first, with
 *     {@link INTRA_USER_DELAY_MS} between sends.
 *   - PATCH bump (same major.minor) → silent. Users are still marked notified
 *     so future minor bumps compare against the right baseline.
 *   - MINOR/MAJOR bump but every entry in the queue is missing → mark the user
 *     notified to current and emit a warning. Avoids an infinite retry loop.
 *
 * Idempotency is per-user via the `notified_version` column. After each
 * successful send the user is marked to that version, so a crash or transient
 * failure mid-batch is resumed cleanly on the next boot.
 *
 * This broadcast **bypasses the daily-push budget** (ADR 004's proactive cap):
 * it is a one-shot-per-version event made idempotent by `notified_version`,
 * not by the daily budget. It is delivered Notifier-direct, like a solicited
 * reminder.
 *
 * Failure handling: send failures are classified inside the Notifier as
 * permanent or transient. Permanent = user blocked the bot / deactivated
 * account — the Notifier has already flipped `active = 0`, and we still
 * `markNotified` so the dead user is not a perpetual broadcast candidate.
 * Transient = rate limit, 5xx, network error — leave `notified_version` at the
 * last successful version, next boot tries again. The classifier itself lives
 * in `src/bot/notifier.ts`.
 */

import type { Logger } from 'pino';

import {
  findActiveUsersBehindCurrentVersion,
  markNotified,
  type VersionCandidate,
} from '../db/repositories/user.repo';
import type {
  AnnouncementMessage,
  NotificationCta,
  NotificationPayload,
  Notifier,
} from './notifier';

export type AnnouncementEntry = string | AnnouncementMessage;

export interface AnnouncerOptions {
  currentVersion: string;
  announcements: Record<string, AnnouncementEntry>;
  notifier: Notifier;
  logger: Logger;
  /** Test seam. Defaults to a real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Test seam. ms between users (outer flood control). */
  rateLimitMs?: number;
}

const DEFAULT_RATE_LIMIT_MS = 100;

/**
 * Spacing between consecutive sends to the same user, in ms. Larger than the
 * outer `rateLimitMs` so Telegram doesn't visually batch a multi-version queue
 * into one notification block. UX guardrail, not a setting.
 */
const INTRA_USER_DELAY_MS = 1500;

/**
 * Maximum announcements delivered to one user in a single broadcast. A user
 * behind by more than this many minors gets the most recent N (ascending
 * order); older entries remain available via `/changelog`. UX guardrail, not
 * a setting.
 */
const MAX_ANNOUNCEMENTS_PER_USER = 3;

/**
 * One slot in a user's announcement queue: the version it belongs to and the
 * normalized message body to send.
 */
interface QueueEntry {
  version: string;
  message: AnnouncementMessage;
}

export async function announceNewVersion(options: AnnouncerOptions): Promise<void> {
  const {
    currentVersion,
    announcements,
    notifier,
    logger,
    sleep = defaultSleep,
    rateLimitMs = DEFAULT_RATE_LIMIT_MS,
  } = options;

  const candidates = findActiveUsersBehindCurrentVersion(currentVersion);
  if (candidates.length === 0) {
    logger.debug({ currentVersion }, 'version-announcer: no candidates');
    return;
  }

  let sent = 0;
  let markedPermanent = 0;
  let skipped = 0;
  let skippedTransient = 0;

  for (const user of candidates) {
    const delta = classifyDelta(user.notifiedVersion, currentVersion);

    if (delta === 'skip') {
      // Patch-only bump (or equal, or downgrade). Mark current so future
      // comparisons are clean, but send nothing.
      markNotified(user.id, currentVersion);
      skipped++;
      continue;
    }

    let queue = collectQueue(announcements, user.notifiedVersion, currentVersion);
    if (!user.optedIn) {
      queue = queue.filter((q) => q.message.priority === true);
    }

    if (queue.length === 0) {
      // No deliverable entry — either every interim release was patch-only /
      // message-less, or this user is opted out and nothing in the queue was
      // priority. Mark current to avoid re-evaluating next boot.
      logger.warn(
        { currentVersion, userId: user.id, optedIn: user.optedIn },
        'version-announcer: nothing to deliver; marking notified to avoid retry loop',
      );
      markNotified(user.id, currentVersion);
      skipped++;
      continue;
    }

    if (queue.length > MAX_ANNOUNCEMENTS_PER_USER) {
      queue = queue.slice(queue.length - MAX_ANNOUNCEMENTS_PER_USER);
    }

    const userOutcome = await sendQueue(user, queue, {
      currentVersion,
      notifier,
      logger,
      sleep,
    });

    sent += userOutcome.sent;
    if (userOutcome.markedPermanent) markedPermanent++;
    if (userOutcome.skippedTransient) skippedTransient++;

    if (rateLimitMs > 0) await sleep(rateLimitMs);
  }

  logger.info(
    {
      currentVersion,
      candidates: candidates.length,
      sent,
      markedPermanent,
      skipped,
      skippedTransient,
    },
    'version-announcer: broadcast complete',
  );
}

interface SendQueueDeps {
  currentVersion: string;
  notifier: Notifier;
  logger: Logger;
  sleep: (ms: number) => Promise<void>;
}

interface UserOutcome {
  sent: number;
  markedPermanent: boolean;
  skippedTransient: boolean;
}

/**
 * Walk one user's queue. On every successful send, mark notified to that
 * version so a crash or transient failure resumes from there next boot. On
 * permanent failure, mark to current — the Notifier has already flipped
 * `active = 0`, and we don't want this user to remain a perpetual broadcast
 * candidate.
 */
async function sendQueue(
  user: VersionCandidate,
  queue: readonly QueueEntry[],
  deps: SendQueueDeps,
): Promise<UserOutcome> {
  const { currentVersion, notifier, logger, sleep } = deps;
  let sent = 0;
  let lastSent: string | null = null;
  let bail = false;
  let permanent = false;
  let transient = false;

  for (let i = 0; i < queue.length; i++) {
    if (i > 0) await sleep(INTRA_USER_DELAY_MS);
    const entry = queue[i]!;
    const payload: NotificationPayload = entry.message.cta
      ? { body: entry.message.body, cta: entry.message.cta }
      : { body: entry.message.body };
    const outcome = await notifier.send(user.id, payload);
    if (outcome === 'ok') {
      lastSent = entry.version;
      sent++;
      continue;
    }
    if (outcome === 'permanent-failure') {
      markNotified(user.id, currentVersion);
      permanent = true;
      bail = true;
      break;
    }
    logger.warn(
      { userId: user.id, currentVersion, atVersion: entry.version },
      'version-announcer: transient delivery failure; will retry next boot',
    );
    transient = true;
    bail = true;
    break;
  }

  if (!bail) {
    markNotified(user.id, currentVersion);
  } else if (lastSent !== null && !permanent) {
    // Transient mid-batch: resume from the last delivered version next boot.
    markNotified(user.id, lastSent);
  }

  return { sent, markedPermanent: permanent, skippedTransient: transient };
}

/**
 * Build the ascending-semver queue of deliverable entries for a user. Filters
 * announcement keys to those strictly newer than `notifiedVersion` and
 * at-or-before `currentVersion`, drops entries with no body, and sorts
 * oldest-first so the user reads the narrative in release order.
 */
function collectQueue(
  announcements: Record<string, AnnouncementEntry>,
  notifiedVersion: string | null,
  currentVersion: string,
): QueueEntry[] {
  const current = parseSemver(currentVersion);
  if (current === null) return [];
  const entries: QueueEntry[] = [];
  for (const [version, raw] of Object.entries(announcements)) {
    const v = parseSemver(version);
    if (v === null) continue;
    if (compareSemver(v, current) > 0) continue;
    if (notifiedVersion !== null) {
      const n = parseSemver(notifiedVersion);
      if (n !== null && compareSemver(v, n) <= 0) continue;
    }
    const message = normalizeEntry(raw);
    if (message === null) continue;
    entries.push({ version, message });
  }
  entries.sort((a, b) => compareSemver(parseSemver(a.version)!, parseSemver(b.version)!));
  return entries;
}

function compareSemver(a: Semver, b: Semver): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

type Delta = 'ping' | 'skip';

export function classifyDelta(notified: string | null, current: string): Delta {
  if (notified === null) return 'ping';
  const n = parseSemver(notified);
  const c = parseSemver(current);
  if (n === null || c === null) return 'ping'; // treat unparseable as "behind"
  if (c.major > n.major) return 'ping';
  if (c.major === n.major && c.minor > n.minor) return 'ping';
  return 'skip';
}

interface Semver {
  major: number;
  minor: number;
  patch: number;
}

function parseSemver(v: string): Semver | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeEntry(entry: AnnouncementEntry | undefined): AnnouncementMessage | null {
  if (entry === undefined) return null;
  if (typeof entry === 'string') return { body: entry };
  return entry;
}

/**
 * Telegram's hard cap on `callback_data`. Callback strings longer than this
 * can't even be registered with the keyboard — Telegram rejects the outgoing
 * message. We check at boot so a bad herb id is caught once, not for every
 * recipient mid-broadcast.
 */
const TELEGRAM_CALLBACK_DATA_LIMIT = 64;

/**
 * Lookup contract a CTA validator needs from the content corpus. Mirrors the
 * slice of `LoadedContent` the announcer touches without dragging the full
 * content type into the services layer.
 */
export interface AnnouncementValidatorContent {
  herbs: { byId: ReadonlyMap<string, unknown> };
}

/**
 * Boot-time check: every announcement entry that opts in to a CTA must point
 * at a herb that exists in the corpus, and the resulting `callback_data` must
 * fit in Telegram's 64-byte cap. The CTA reuses the global `herb:<id>` handler
 * (`src/bot/commands/herb.ts`), so no dedicated announce-action handler exists.
 * Throws on the first failure with enough context to find the offending entry
 * — better to crash on `npm start` than to broadcast a button every recipient
 * silently fails on.
 */
export function validateAnnouncements(
  announcements: Record<string, AnnouncementEntry>,
  content: AnnouncementValidatorContent,
): void {
  for (const [version, entry] of Object.entries(announcements)) {
    const message = normalizeEntry(entry);
    if (!message?.cta) continue;
    validateCta(version, message.cta, content);
  }
}

function validateCta(
  version: string,
  cta: NotificationCta,
  content: AnnouncementValidatorContent,
): void {
  switch (cta.kind) {
    case 'open-herb': {
      if (!content.herbs.byId.has(cta.herbId)) {
        throw new Error(
          `version-announcer: announcement '${version}' has CTA pointing at missing herb '${cta.herbId}'`,
        );
      }
      const callbackData = `herb:${cta.herbId}`;
      const byteLength = Buffer.byteLength(callbackData, 'utf8');
      if (byteLength > TELEGRAM_CALLBACK_DATA_LIMIT) {
        throw new Error(
          `version-announcer: announcement '${version}' callback_data '${callbackData}' is ${byteLength} bytes (limit ${TELEGRAM_CALLBACK_DATA_LIMIT})`,
        );
      }
      return;
    }
  }
}
