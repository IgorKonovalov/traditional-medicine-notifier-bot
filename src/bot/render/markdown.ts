/**
 * Content → Telegram rendering. The corpus is renderer-agnostic markdown
 * (ADR 002); the bot delivers plain text (no `parse_mode`), so emphasis is
 * carried by the words themselves. This skeleton strips the most common
 * markdown markers to readable plain text and truncates to Telegram's limit.
 *
 * When richer formatting is needed, replace the body here behind a single
 * centralized helper — never set `parse_mode` ad hoc in a handler.
 */

/** Telegram's practical per-message character ceiling (well under the 4096 hard cap). */
export const TELEGRAM_LIMIT = 3800;

/** Strip headings, emphasis, and link syntax to plain text. */
export function toPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1') // italic
    .replace(/_(.+?)_/g, '$1') // italic (underscore)
    .replace(/`(.+?)`/g, '$1') // inline code
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1') // links → label
    .replace(/([^\n])\n(?!\n)/g, '$1 ') // join soft-wrap newlines within a paragraph
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

/**
 * Split text into ≤`TELEGRAM_LIMIT` chunks for multi-message delivery — the
 * sanctioned splitter for long sends (ADR 008). Unlike {@link clampToTelegram},
 * it loses nothing: paragraphs (blank-line separated) are packed greedily into
 * chunks, and a single paragraph that still overflows is cut on word boundaries
 * into several chunks. Short text returns `[text]` unchanged, so callers can
 * always send the array as-is.
 */
export function splitForTelegram(text: string): string[] {
  if (text.length <= TELEGRAM_LIMIT) return [text];

  const chunks: string[] = [];
  let current = '';
  const flush = (): void => {
    if (current !== '') {
      chunks.push(current);
      current = '';
    }
  };

  for (const paragraph of text.split(/\n{2,}/)) {
    if (paragraph.length > TELEGRAM_LIMIT) {
      // An oversized paragraph can't join any chunk — flush, then hard-split it
      // on word boundaries into its own run of chunks.
      flush();
      chunks.push(...splitLongRun(paragraph));
      continue;
    }
    const candidate = current === '' ? paragraph : `${current}\n\n${paragraph}`;
    if (candidate.length > TELEGRAM_LIMIT) {
      flush();
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  flush();
  return chunks;
}

/**
 * Cut a single over-limit run into ≤`TELEGRAM_LIMIT` pieces on word boundaries,
 * preserving every word (no ellipsis). A single word longer than the limit is
 * cut at the limit as a last resort.
 */
function splitLongRun(run: string): string[] {
  const pieces: string[] = [];
  let rest = run;
  while (rest.length > TELEGRAM_LIMIT) {
    const window = rest.slice(0, TELEGRAM_LIMIT);
    const lastSpace = window.lastIndexOf(' ');
    const cut = lastSpace > 0 ? lastSpace : TELEGRAM_LIMIT;
    pieces.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest !== '') pieces.push(rest);
  return pieces;
}
