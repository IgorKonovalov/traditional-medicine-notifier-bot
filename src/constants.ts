/**
 * Compile-time platform invariants — the fixed rules of the Telegram surface and
 * of calendar time, as opposed to the **env-derived** values in `config.ts`.
 *
 * This is a leaf module: it imports nothing from `src/` and depends on no
 * framework or Node API, so it is safe to import from both the `bot/` layer and
 * the pure `notifications/` domain without violating the ADR 003 boundaries.
 *
 * Home for values that were previously defined twice and free to drift; keep a
 * constant here only when it is a genuine invariant shared by ≥2 call sites.
 * A single-use constant belongs next to its use site, not here.
 */

/**
 * Telegram's hard cap on `callback_data`, in bytes. A payload longer than this
 * can't be registered on an inline button — Telegram rejects the outgoing
 * message — so every payload is guarded by `assertCallbackData` (`keyboards.ts`)
 * and the version-announcer's boot-time CTA check.
 */
export const CALLBACK_DATA_LIMIT = 64;

/**
 * Practical per-message character ceiling, kept well under Telegram's 4096 hard
 * cap. Used by the message splitter/clamp (`render/markdown.ts`) and the
 * changelog render budget — both express "one message must fit under this".
 */
export const TELEGRAM_MESSAGE_LIMIT = 3800;

/** Milliseconds in a calendar day. Used by recurrence math and date pickers. */
export const MS_PER_DAY = 86_400_000;
