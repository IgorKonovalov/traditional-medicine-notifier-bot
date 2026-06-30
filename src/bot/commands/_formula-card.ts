/**
 * Formula (combination) card rendering — the combinations surface (Plan 009
 * Phase 5, ADR 006 doctor-gate, now live post owner sign-off 2026-06-29). As of
 * Plan 014 / ADR 011 the card renders as **rich Telegram HTML** through the
 * branded `html` seam: bold name, an italic original-names sub-line, a
 * nature·tradition tag line, a bulleted composition (Latin parenthetical in
 * `<code>`), the verbose fields folded into `<blockquote expandable>`, distinct
 * cautions, and the render-time disclaimer in a `<blockquote>` (ADR 006).
 *
 * Owner-approved field set: name(s) + `nature` («Сущность») + `composition` +
 * `members` as herb cross-links + `cautions` + the disclaimer, and — as a
 * live-review surface ahead of large production — the structured verbose fields
 * `indications`/`traditionalUse`/`dosingNotes`. The raw `sourceText` and the
 * markdown `body` remain **unsurfaced** (Plan 004 practitioner review). The older
 * `themes` line is dropped from the card now that the richer verbose fields are
 * surfaced.
 *
 * Every interpolated content value is HTML-escaped at the boundary (the `html`
 * tagged template does this automatically) — one unescaped `< > &` would make
 * Telegram reject the whole message (ADR 011).
 */

import { Markup } from 'telegraf';

import type { Combination, LoadedContent } from '../../content/types';
import { assertCallbackData, tradition } from '../keyboards';
import { messages } from '../messages';
import { html, unsafeHtml, type Html } from '../render/html';
import { TELEGRAM_LIMIT, truncateRenderedHtml } from '../render/markdown';

type CallbackButton = ReturnType<typeof Markup.button.callback>;

/**
 * Headroom for the close tags {@link truncateRenderedHtml} may append past its
 * budget when a cut lands inside an open tag (deepest case: a `<code>` inside a
 * composition bullet nested in nothing else, or a lone `</blockquote>`). 32 is a
 * comfortable upper bound on the card's shallow nesting.
 */
const TAG_CLOSE_MARGIN = 32;

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

/**
 * Known `name_original` label prefixes → a compact abbreviation. The freeform
 * source string occasionally follows a `Монгольское: … ; тибетское: … ` shape;
 * when it does we compact it to a single scannable italic line. The mapping is
 * deliberately small — anything unrecognised falls back to the verbatim string
 * (see {@link parseOriginalNames}).
 */
const ORIGINAL_NAME_LABELS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^монгольск(?:ое|ий)$|^монг\.?$/i, 'Монг.'],
  [/^тибетск(?:ое|ие|ий)$|^на тибетском$|^тиб\.?$/i, 'Тиб.'],
  [/^санскрит$|^санскр\.?$/i, 'Санскр.'],
  [/^китайск(?:ое|ий)$|^кит\.?$/i, 'Кит.'],
  [/^английск(?:ое|ий)$|^англ\.?$/i, 'англ.'],
];

function labelAbbrev(label: string): string | null {
  const trimmed = label.trim();
  for (const [re, abbrev] of ORIGINAL_NAME_LABELS) {
    if (re.test(trimmed)) return abbrev;
  }
  return null;
}

/**
 * Compact a freeform `name_original` string for the italic sub-line. When the
 * string is a `;`-separated list of `Label: value` segments using a recognised
 * script label, each labelled segment is abbreviated (`Монг.: …`) and the parts
 * are joined with ` · `; unlabelled parts (e.g. a trailing Latin variant) are
 * kept verbatim. Anything that matches **no** label falls back to the whole
 * string unchanged — never throws. Returns plain text; the caller wraps it in
 * `<i>` and the `html` template escapes it.
 */
export function parseOriginalNames(raw: string): string {
  const parts = raw
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p !== '');
  const out: string[] = [];
  let matched = false;
  for (const part of parts) {
    const colon = part.indexOf(':');
    if (colon > 0) {
      const abbrev = labelAbbrev(part.slice(0, colon));
      if (abbrev !== null) {
        matched = true;
        out.push(`${abbrev}: ${part.slice(colon + 1).trim()}`);
        continue;
      }
    }
    out.push(part);
  }
  // No recognised label anywhere → keep the original string verbatim.
  return matched ? out.join(' · ') : raw.trim();
}

/**
 * One composition line. Entries shaped `Русское (Latin)` get the parenthetical
 * Latin wrapped in `<code>`; entries without one render as a plain bullet
 * (best-effort, no frontmatter change — Plan 014).
 */
function compositionLine(entry: string): Html {
  const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(entry);
  if (m !== null && m[1]!.trim() !== '') {
    return html`• ${m[1]!.trim()} (<code>${m[2]!.trim()}</code>)`;
  }
  return html`• ${entry}`;
}

/**
 * A labelled multi-line field: a bold label then the value on the following
 * line(s). Built by `join`ing the two on a newline rather than embedding one in
 * a template literal, so the rendered break carries no source indentation (a
 * multi-line backtick template would bake the indent in). The only `<blockquote>`
 * on the card is the disclaimer — verbose fields stay plain so the card doesn't
 * read as a stack of quotes.
 */
function labeledSection(label: string, value: string): Html {
  const head = html`<b>${label}:</b>`;
  const body = html`${value}`;
  return unsafeHtml([head, body].join('\n'));
}

export function renderFormula(combination: Combination): Html {
  const c = combination;
  const sections: string[] = [];

  // Header + italic original-names sub-line + nature·tradition tag line.
  sections.push(html`🧪 <b>${c.nameRu}</b>`);
  if (c.nameOriginal) sections.push(html`<i>${parseOriginalNames(c.nameOriginal)}</i>`);
  const trad = tradition(c.tradition);
  sections.push(c.nature ? html`<i>${c.nature} · ${trad}</i>` : html`<i>${trad}</i>`);

  // Composition — bold label then one bulleted line per entry.
  if (c.composition.length > 0) {
    const label = html`<b>${messages.formulaCard.composition}:</b>`;
    const lines = c.composition.map(compositionLine).join('\n');
    sections.push(`${label}\n${lines}`);
  }

  // Indications inline; traditional-use / dosing as plain labelled sections.
  if (c.indications?.length) {
    sections.push(html`<b>${messages.formulaCard.indications}:</b> ${c.indications.join('; ')}`);
  }
  if (c.traditionalUse?.length) {
    sections.push(labeledSection(messages.formulaCard.use, c.traditionalUse.join('\n')));
  }
  if (c.dosingNotes?.length) {
    sections.push(labeledSection(messages.formulaCard.dosing, c.dosingNotes.join('\n')));
  }
  if (c.cautions.length > 0) {
    sections.push(html`⚠️ <b>${messages.formulaCard.cautions}:</b> ${c.cautions.join('; ')}`);
  }

  // Truncate the body with room reserved for the disclaimer, which is appended
  // **after** the cut so it is never truncated (ADR 006 / ADR 011). The extra
  // TAG_CLOSE_MARGIN covers the close tags truncateRenderedHtml may append past
  // its budget (e.g. a 13-char `</blockquote>`), so the assembled card stays at
  // or under TELEGRAM_LIMIT.
  const disclaimer = html`<blockquote>${messages.disclaimer}</blockquote>`;
  const budget = TELEGRAM_LIMIT - disclaimer.length - TAG_CLOSE_MARGIN - 2;
  const body = truncateRenderedHtml(sections.join('\n\n'), budget);
  return unsafeHtml(`${body}\n\n${disclaimer}`);
}

/** Member buttons per row. A 3-up grid keeps the keyboard short (Plan 023). */
const MEMBER_COLUMNS = 3;

/**
 * Keyboard for a formula card: resolved member herbs as a 3-column grid of
 * callback buttons (each opening that herb's card via the shared `lib:herb:<id>`
 * route), then the calling flow's navigation rows. The card body already lists
 * the full composition, so the buttons are purely a navigation affordance —
 * packing them into a grid loses no information and cuts the keyboard height
 * ~⅔ for typical formulas (Plan 023). A non-multiple-of-3 member count leaves
 * 1–2 buttons in the final member row; nav rows still follow on their own rows.
 */
export function formulaCardKeyboard(
  memberLinks: readonly MemberLink[],
  navRows: CallbackButton[][],
): ReturnType<typeof Markup.inlineKeyboard> {
  const memberRows: CallbackButton[][] = [];
  for (let i = 0; i < memberLinks.length; i += MEMBER_COLUMNS) {
    memberRows.push(
      memberLinks
        .slice(i, i + MEMBER_COLUMNS)
        .map((link) =>
          Markup.button.callback(link.nameRu, assertCallbackData(`lib:herb:${link.id}`)),
        ),
    );
  }
  return Markup.inlineKeyboard([...memberRows, ...navRows]);
}
