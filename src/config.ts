/**
 * Typed config built from environment variables. Fail-fast on boot — never
 * read `process.env` directly elsewhere in the codebase.
 *
 * `requireEnv` for hard requirements, `optionalEnv` with a fallback for
 * everything else.
 */

import 'dotenv/config';

export interface Config {
  readonly botToken: string;
  /**
   * The bot's `@username` (without leading `@`). Used to build
   * `https://t.me/<botUsername>?start=<payload>` deep links for content
   * cross-references. Format-checked at load.
   */
  readonly botUsername: string;
  readonly dbPath: string;
  readonly contentDir: string;
  readonly logLevel: string;
  /** Single timezone for all schedules and calendar-day boundaries (MVP). */
  readonly timezone: string;
  /**
   * Cron for the SOLICITED reminder dispatch tick. Runs often (default every
   * minute) so user-chosen times fire close to the minute. These deliveries
   * are not subject to the proactive daily cap.
   */
  readonly reminderTickCron: string;
  /**
   * Cron for the PROACTIVE daily-tip / subscription dispatch, evaluated in
   * `timezone`. Each subscriber receives at most one proactive push per
   * calendar day (the notification-budget gate).
   */
  readonly dailyTipCron: string;
  readonly backupDir: string;
  /**
   * Telegram-id allowlist for admin-only commands. Parsed from
   * `ADMIN_TELEGRAM_IDS` (comma-separated). Empty / unset → empty set → admin
   * handlers silently no-op. Compared against `ctx.from.id.toString()` —
   * `auth_identities.external_id` is `TEXT`, so we keep the contract honest.
   */
  readonly adminTelegramIds: ReadonlySet<string>;
  /**
   * Gates the combinations (formula) library branch (ADR 006 / ADR 009).
   * Default **false** — the verbose, doctor-gated corpus ships dark until the
   * owner's documented medical sign-off. Plumbed here; Plan 009 consumes it.
   */
  readonly featureCombinationsBrowser: boolean;
}

/**
 * Telegram's bot-username rule: starts with a letter, 5–32 chars total,
 * remainder is `[a-zA-Z0-9_]`. Validated at boot so a misconfigured deploy
 * fails loudly instead of silently emitting broken deep-link URLs.
 */
const BOT_USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/;

export function loadConfig(): Config {
  const botToken = requireEnv('BOT_TOKEN');
  const botUsername = requireEnv('BOT_USERNAME');
  if (!BOT_USERNAME_RE.test(botUsername)) {
    throw new Error(
      `Invalid BOT_USERNAME ${JSON.stringify(botUsername)}: must match Telegram's bot-username rule (5–32 chars, starts with a letter, remainder [a-zA-Z0-9_], no leading '@').`,
    );
  }
  return {
    botToken,
    botUsername,
    dbPath: optionalEnv('DB_PATH', './data/tm-bot.db'),
    contentDir: optionalEnv('CONTENT_DIR', './content'),
    logLevel: optionalEnv('LOG_LEVEL', 'info'),
    timezone: assertValidTimezone(optionalEnv('TIMEZONE', 'UTC')),
    reminderTickCron: optionalEnv('REMINDER_TICK_CRON', '* * * * *'),
    dailyTipCron: optionalEnv('DAILY_TIP_CRON', '0 9 * * *'),
    backupDir: optionalEnv('BACKUP_DIR', '/var/backups/traditional-medicine-notifier-bot'),
    adminTelegramIds: parseAdminTelegramIds(process.env['ADMIN_TELEGRAM_IDS']).ids,
    featureCombinationsBrowser: parseBoolean(optionalEnv('FEATURE_COMBINATIONS_BROWSER', 'false')),
  };
}

/**
 * Parse a boolean feature flag from its env string. Accepts `1`/`true`/`yes`/`on`
 * (case-insensitive) as true; everything else — including unset (the caller's
 * fallback) — is false, so a flag is off unless explicitly enabled.
 */
export function parseBoolean(raw: string): boolean {
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

/**
 * Parses the `ADMIN_TELEGRAM_IDS` env var. Splits on `,`, trims, drops empty
 * entries. Entries that don't look like a Telegram numeric id are surfaced
 * separately so the boot logger can warn without breaking the deploy.
 * Exported so tests can drive the edge cases without mutating `process.env`.
 */
export function parseAdminTelegramIds(raw: string | undefined): {
  readonly ids: ReadonlySet<string>;
  readonly malformed: readonly string[];
} {
  if (!raw) return { ids: new Set(), malformed: [] };
  const ids = new Set<string>();
  const malformed: string[] = [];
  for (const part of raw.split(',')) {
    const entry = part.trim();
    if (entry === '') continue;
    if (/^\d+$/.test(entry)) {
      ids.add(entry);
    } else {
      malformed.push(entry);
    }
  }
  return { ids, malformed };
}

/**
 * Validates an IANA time-zone name by asking `Intl` to build a formatter for
 * it — an unknown zone throws a `RangeError`. Keeps config fail-fast so a typo
 * in `TIMEZONE` surfaces at boot, not at the first scheduled dispatch.
 * Exported so tests can drive the edge cases without mutating `process.env`.
 */
export function assertValidTimezone(tz: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    throw new Error(
      `Invalid TIMEZONE ${JSON.stringify(tz)}: must be a valid IANA time-zone name (e.g. "UTC", "Europe/Moscow", "Asia/Shanghai").`,
    );
  }
  return tz;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}
