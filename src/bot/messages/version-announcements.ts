/**
 * Per-version Russian announcement strings + the /changelog renderer
 * (plan 010). Split into its own module from the start — the parent
 * `messages.ts` is glued back to `messages.versionAnnouncements` and
 * `messages.changelog`, but the map grows one entry per minor close and the
 * renderer is self-contained, so pre-splitting avoids a churny move later.
 *
 * Plaintext only (ADR 002): unlike the sibling serbian-language-bot, this bot
 * sets no `parse_mode`, so emphasis is carried by emoji and spacing — never
 * `<b>` markup. Each entry stays ≤ one sentence / ~15 words.
 */

import type { AnnouncementMessage } from '../../services/notifier';

const CHANGELOG_HEADER = '📋 Что нового в боте';
const CHANGELOG_EMPTY = 'История обновлений пока пуста.';
const CHANGELOG_TRUNCATED = '… (более ранние версии скрыты)';
/**
 * Conservative buffer under Telegram's reply cap. The render loop stops adding
 * entries when the next one would push the body past this number; older
 * entries are replaced with `CHANGELOG_TRUNCATED`. Mirrors the
 * `TELEGRAM_REPLY_CAP` regression guard in `changelog.test.ts` — keep the two
 * in sync.
 */
const CHANGELOG_BUDGET = 3800;

/**
 * Descending semver-tuple comparator. Splits on `.`, parses each segment as an
 * integer, compares numerically — so `0.13.0` ranks before `0.2.0`, unlike a
 * naive lexicographic sort. Malformed segments fall back to 0 rather than
 * throwing; the version-announcer already gates the map so production input is
 * well-formed.
 */
function compareSemverDesc(a: string, b: string): number {
  const ap = a.split('.').map((s) => Number.parseInt(s, 10) || 0);
  const bp = b.split('.').map((s) => Number.parseInt(s, 10) || 0);
  const len = Math.max(ap.length, bp.length);
  for (let i = 0; i < len; i++) {
    const diff = (bp[i] ?? 0) - (ap[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Patch bumps are normally silent (absent from the map); minor/major bumps
 * must have an entry or the announcer logs a warning and marks users notified
 * anyway (to prevent an infinite retry loop).
 *
 * Seeded **empty** — the first entry is authored by the architect at plan
 * close on a minor/major bump (plan 010 phase 4). Do not author entries here
 * during implementation.
 */
export const versionAnnouncements: Record<string, string | AnnouncementMessage> = {};

/**
 * Retrospective view of `versionAnnouncements` for `/changelog`. Sort is
 * descending semver (newest first); each entry gets a normalized `▸ X.Y.Z`
 * header so author phrasing inconsistencies don't leak into the output. CTAs
 * are stripped — they're point-in-time at broadcast and would carry stale
 * herb links here. Plaintext only (ADR 002): no `<b>` markup.
 */
export const changelogMessages = {
  header: CHANGELOG_HEADER,
  empty: CHANGELOG_EMPTY,
  render: (announcements: Record<string, string | AnnouncementMessage>): string => {
    const keys = Object.keys(announcements);
    if (keys.length === 0) {
      return `${CHANGELOG_HEADER}\n\n${CHANGELOG_EMPTY}`;
    }
    const sorted = keys.slice().sort(compareSemverDesc);
    // Budgeted accumulation: walk newest → oldest, stop when adding the next
    // entry would bust the Telegram reply cap. Older entries get replaced with
    // a single truncation marker. Required because the corpus grows by one
    // entry per minor close and would otherwise trip the regression guard in
    // `changelog.test.ts`. Keep `CHANGELOG_BUDGET` in sync with the test's
    // TELEGRAM_REPLY_CAP.
    const head = `${CHANGELOG_HEADER}\n\n`;
    const TAIL_LEN = 2 + CHANGELOG_TRUNCATED.length; // '\n\n' + marker
    const blocks: string[] = [];
    let used = head.length;
    let truncated = false;
    for (let i = 0; i < sorted.length; i++) {
      const version = sorted[i]!;
      const entry = announcements[version]!;
      const body = typeof entry === 'string' ? entry : entry.body;
      const block = `▸ ${version}\n${body}`;
      const sep = blocks.length === 0 ? 0 : 2; // '\n\n' between blocks
      // Reserve tail space whenever older entries remain — if this block is
      // rejected we'll append the truncation marker, which would otherwise
      // push the rendered output past CHANGELOG_BUDGET.
      const tailReserve = i < sorted.length - 1 ? TAIL_LEN : 0;
      if (used + sep + block.length + tailReserve > CHANGELOG_BUDGET) {
        truncated = true;
        break;
      }
      blocks.push(block);
      used += sep + block.length;
    }
    const tail = truncated ? `\n\n${CHANGELOG_TRUNCATED}` : '';
    return `${head}${blocks.join('\n\n')}${tail}`;
  },
};
