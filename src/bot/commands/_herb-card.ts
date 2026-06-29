/**
 * Shared herb-card rendering, reused by the library and search drilldown flows
 * and the notification "Открыть" CTA. Keeping it in one place means every entry
 * point renders an identical card. The render-time disclaimer was scoped down to
 * the formula card + /start + /help only (2026-06-29, amends ADR 006 #2/#4), so
 * ingredient cards no longer carry it.
 *
 * The card optionally carries a **"Входит в составы"** cross-link section
 * (Plan 009 Phase 3; UI label «Составы», code keeps "formula" — Plan 017): the
 * formulas whose `members` include this herb, resolved
 * from `content.crossLinks`. The section is **omitted entirely** while the
 * combinations branch is withheld (ADR 006 doctor-gate) — callers pass an empty
 * list, so there are never dead links to an unregistered formula card.
 */

import { Markup } from 'telegraf';

import type { Herb, LoadedContent } from '../../content/types';
import { assertCallbackData, tradition } from '../keyboards';
import { messages } from '../messages';
import { clampToTelegram, toPlainText } from '../render/markdown';

type CallbackButton = ReturnType<typeof Markup.button.callback>;

/**
 * Cap on the reverse cross-link buttons. A ubiquitous ingredient like
 * `tib-haritaki` (Миробалан хебула) is a member of ~94 formulas; one button each
 * builds an inline keyboard Telegram rejects (the whole edit then fails with the
 * generic error). Cap the buttons to a useful sample — the rest stay reachable
 * via 🔎 search — and tell the reader the section is truncated. 8 mirrors the
 * library `PAGE_SIZE`.
 */
const MAX_FORMULA_LINKS = 8;

/** A reverse cross-link to a formula the herb is a member of. */
export interface FormulaLink {
  readonly id: string;
  readonly nameRu: string;
}

/**
 * Resolve the formulas a herb belongs to, for the card's cross-link section.
 * Returns `[]` (so the section is omitted) when the combinations branch is
 * withheld — the single doctor-gate (`_formula-gate`) flows in via `enabled`.
 */
export function herbFormulaLinks(
  herbId: string,
  content: Pick<LoadedContent, 'crossLinks' | 'combinations'>,
  enabled: boolean,
): FormulaLink[] {
  if (!enabled) return [];
  const ids = content.crossLinks.formulasByHerb.get(herbId) ?? [];
  const links: FormulaLink[] = [];
  for (const id of ids) {
    const combination = content.combinations.byId.get(id);
    if (combination !== undefined) links.push({ id: combination.id, nameRu: combination.nameRu });
  }
  return links;
}

export function renderHerb(herb: Herb, formulaLinks: readonly FormulaLink[] = []): string {
  const header = `${herb.nameRu}${herb.nameLatin ? ` (${herb.nameLatin})` : ''} · ${tradition(herb.tradition)}`;
  // No render-time disclaimer here: as of 2026-06-29 it is scoped to the formula
  // card + /start + /help only (amends ADR 006 #2/#4). Clamp the body first so
  // the cross-link header is never truncated away.
  const body = clampToTelegram(`${header}\n\n${toPlainText(herb.body)}`);
  const parts = [body];
  // The formula names live on the buttons below; this is just the section label.
  // When the herb belongs to more formulas than fit on the keyboard, say so.
  if (formulaLinks.length > 0) {
    parts.push(
      formulaLinks.length > MAX_FORMULA_LINKS
        ? messages.herbCard.inFormulasCapped(MAX_FORMULA_LINKS, formulaLinks.length)
        : messages.herbCard.inFormulas,
    );
  }
  return parts.join('\n\n');
}

/**
 * Keyboard for an anchored herb card: the `⏰ Напомнить` CTA (Plan 008), then one
 * button per reverse-linked formula (Plan 009 — present only when the
 * combinations branch is registered), then the calling flow's navigation rows.
 */
export function herbCardKeyboard(
  herbId: string,
  navRows: CallbackButton[][],
  formulaLinks: readonly FormulaLink[] = [],
): ReturnType<typeof Markup.inlineKeyboard> {
  const rows: CallbackButton[][] = [[Markup.button.callback('⏰ Напомнить', `remind:${herbId}`)]];
  // Cap the reverse-link buttons so a herb in dozens of formulas can't build an
  // oversized keyboard Telegram rejects (the render label notes the truncation).
  for (const link of formulaLinks.slice(0, MAX_FORMULA_LINKS)) {
    rows.push([Markup.button.callback(link.nameRu, assertCallbackData(`lib:formula:${link.id}`))]);
  }
  return Markup.inlineKeyboard([...rows, ...navRows]);
}
