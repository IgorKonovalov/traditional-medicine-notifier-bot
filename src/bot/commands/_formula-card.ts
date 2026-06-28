/**
 * Formula (combination) card rendering — the **withheld** combinations surface
 * (Plan 009 Phase 5, ADR 006 doctor-gate). Reached only once the formula branch
 * is registered post sign-off (`_formula-gate`).
 *
 * Owner-approved minimal field set (2026-06-28): name(s) + `nature` («Сущность»)
 * + `composition` + `members` as herb cross-links + `themes` (one descriptive
 * line) + `cautions` + the render-time disclaimer (ADR 006). The verbose
 * review-pending fields (`indications`/`traditionalUse`/`dosingNotes`/
 * `sourceText`) and the raw `body` are **never** surfaced — they stay behind the
 * Plan 004 practitioner review.
 */

import { Markup } from 'telegraf';

import type { Combination, LoadedContent } from '../../content/types';
import { assertCallbackData } from '../keyboards';
import { messages } from '../messages';
import { clampToTelegram } from '../render/markdown';

type CallbackButton = ReturnType<typeof Markup.button.callback>;

/** A cross-link from a formula to one of its member herbs (resolved to a page). */
export interface MemberLink {
  readonly id: string;
  readonly nameRu: string;
}

/** Resolve a formula's `members` to herb cross-links, dropping any that lack a page. */
export function formulaMemberLinks(
  combination: Combination,
  content: Pick<LoadedContent, 'herbs'>,
): MemberLink[] {
  const links: MemberLink[] = [];
  for (const id of combination.members ?? []) {
    const herb = content.herbs.byId.get(id);
    if (herb !== undefined) links.push({ id: herb.id, nameRu: herb.nameRu });
  }
  return links;
}

export function renderFormula(combination: Combination): string {
  const header =
    `${combination.nameRu}` +
    `${combination.nameOriginal ? ` (${combination.nameOriginal})` : ''}` +
    `${combination.nature ? ` · ${combination.nature}` : ''}`;

  const sections: string[] = [header];
  if (combination.composition.length > 0) {
    sections.push(messages.formulaCard.composition(combination.composition.join(', ')));
  }
  if (combination.themes.length > 0) sections.push(combination.themes.join('; '));
  if (combination.cautions.length > 0) {
    sections.push(messages.formulaCard.cautions(combination.cautions.join('; ')));
  }

  // Clamp before the disclaimer so the disclaimer is never truncated (ADR 006).
  return `${clampToTelegram(sections.join('\n\n'))}\n\n${messages.disclaimer}`;
}

/**
 * Keyboard for a formula card: one button per resolved member herb (opening that
 * herb's card via the shared `lib:herb:<id>` route), then the calling flow's
 * navigation rows.
 */
export function formulaCardKeyboard(
  memberLinks: readonly MemberLink[],
  navRows: CallbackButton[][],
): ReturnType<typeof Markup.inlineKeyboard> {
  const rows: CallbackButton[][] = memberLinks.map((link) => [
    Markup.button.callback(link.nameRu, assertCallbackData(`lib:herb:${link.id}`)),
  ]);
  return Markup.inlineKeyboard([...rows, ...navRows]);
}
