/**
 * Content → Telegram rendering. The corpus is renderer-agnostic markdown
 * (ADR 002); the bot delivers plain text (no `parse_mode`), so emphasis is
 * carried by the words themselves. This skeleton strips the most common
 * markdown markers to readable plain text and truncates to Telegram's limit.
 *
 * When richer formatting is needed, replace the body here behind a single
 * centralized helper — never set `parse_mode` ad hoc in a handler.
 */

const TELEGRAM_LIMIT = 3800;

/** Strip headings, emphasis, and link syntax to plain text. */
export function toPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1') // italic
    .replace(/_(.+?)_/g, '$1') // italic (underscore)
    .replace(/`(.+?)`/g, '$1') // inline code
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1') // links → label
    .replace(/\n{3,}/g, '\n\n') // collapse blank runs
    .trim();
}

/** Hard-truncate at the Telegram practical limit, on a word boundary. */
export function clampToTelegram(text: string): string {
  if (text.length <= TELEGRAM_LIMIT) return text;
  const cut = text.slice(0, TELEGRAM_LIMIT);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '…';
}
