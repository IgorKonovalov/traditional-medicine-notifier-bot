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
