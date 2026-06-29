# Plan 014 — Rich-text formatting (Phase 1: render foundation + formula card)

**Status:** Completed
**Created:** 2026-06-29
**Approved:** 2026-06-29
**Completed:** 2026-06-29 (v0.15.0)
**Bump on close:** minor (visible formatting change to a live surface)
**Introduces:** ADR 011 (rich-text Telegram-HTML rendering, amends ADR 002)

## Context

Every user-facing body is plain text + emoji (ADR 002 bans `parse_mode`,
enforced by ESLint). The corpus is richly structured but flattened to
`Label: a, b, c` lines on send — the formula card (`_formula-card.ts →
renderFormula`) collapses name(s), nature, an 8-item composition, indications,
traditional-use, dosing and cautions into blank-line-separated plain lines. It
reads as a wall of text and is hard to remember.

A `/ux-telegram` review + owner interview settled the direction: adopt **rich
Telegram HTML** (bold, italic, monospace, blockquote, expandable) behind a
**centralized, escaping-safe seam** — the pattern the sibling
**serbian-language-bot** runs in production (its ADR 008). ADR 002 explicitly
reserved this path. The roll-out is phased; **this plan is Phase 1 only**:

- the shared **render foundation** (branded `Html`, `escapeHtml`, `html`
  template, tag-aware truncation, HTML-aware send/anchor helpers), and
- the **formula card** as the first surface (richest payoff; already a live
  review surface per ADR 006, owner sign-off 2026-06-29).

Herb cards (Phase 2) and tips + `<pre>` tables (Phase 3) are **out of scope
here** but the foundation is designed so they slot in without rework.

**Related:** introduces **ADR 011** (amends **ADR 002**); respects **ADR 003**
(portability — seam stays in `src/bot/`), **ADR 006** (render-time disclaimer +
doctor-gate; formula verbose fields are a live-review surface), **ADR 009**
(navigation/anchor model). Builds on **Plan 009** (`library.ts` formula card,
`_formula-card.ts`).

## Goals / Non-goals

- **Goals:**
  - A reusable HTML render seam in `src/bot/render/` mirroring serbian-bot:
    branded `Html` type, auto-escaping `html` tagged template, `escapeHtml`,
    `truncateRenderedHtml` (tag/entity-aware).
  - HTML-aware send path: `replyHtml`/`editHtml` and HTML variants of the anchor
    helpers, with `parse_mode: 'HTML'` confined to those helper files (ADR 011).
  - The shared `library.ts` `View` carries an opt-in HTML discriminator so the
    **formula card renders HTML while every other branch stays plain text,
    byte-for-byte unchanged**.
  - **Formula card** re-rendered as HTML per the locked design (header / italic
    original-names sub-line / nature·tradition tag line / bulleted composition
    with `<code>` Latin / expandable blockquote for long verbose fields / ⚠️
    cautions / blockquote disclaimer).
  - `name_original` rendered compactly **without a content migration** — a
    render-time parser with a verbatim fallback.
  - ESLint ban on `parse_mode` stays globally; only the seam files are exempt.
- **Non-goals:**
  - Herb cards (Phase 2) and tips + `<pre>`/label-stack tables (Phase 3). No
    `renderMarkdownToTelegramHtml` (full markdown→HTML body conversion) yet —
    Phase 1's formula card is built from **structured fields**, not the markdown
    body, so it needs only `escapeHtml` + the `html` template.
  - The notifier HTML path (Phase 3 — tips are the first notifier-delivered HTML
    body). Untouched here.
  - Any change to `content/` files, frontmatter schema, or the `Combination`
    type. No re-sanitisation of verbose fields (ADR 006 / Plan 004 own that).
  - Surfacing `source_text` / raw `body` — they stay unsurfaced (ADR 006).

## Decisions

- **ADR 011 (this plan).** parse_mode behind a branded `Html` seam; content stays
  markdown; amends ADR 002. See the ADR for the full rationale.
- **HTML opt-in via the `View` discriminator (not a global flip).** `library.ts`
  renders every branch (herb list, guides, search, formula) through one `View {
  text, keyboard }` + shared `sendAnchor`/`editAnchor`/`editAnchorAt`. Phase 1
  adds `readonly html?: true` to `View`; the anchor dispatch picks the
  HTML-aware helper when set. Plain branches omit the flag and are unchanged.
  This is the seam Phases 2–3 reuse to light up herb cards and tips.
- **`name_original` → render-time parse, fallback verbatim (option a; no
  migration).** A small `parseOriginalNames(raw): string` recognises the
  `Монгольское:/Тибетские:/Санскрит:/Китайское:/Английское:` shape and compacts
  it to an italic `Монг.: … · Тиб.: … · англ.: …` line; when the string doesn't
  match the expected shape it falls back to the **escaped verbatim string** in
  italics. Rationale: restructuring `name_original` into sub-fields is a
  149-file content migration + `Combination`-type change for a cosmetic header —
  not worth it, and reversible later if a structured field is ever wanted. The
  existing test fixture (`nameOriginal: 'A gar 8'`) is already a non-matching
  simple string, so it exercises the fallback for free.
- **Composition `<code>` is best-effort.** Entries shaped `Русское (Latin)` get
  the parenthetical Latin wrapped in `<code>`; entries without a parenthetical
  render as a plain bulleted line. No frontmatter change.
- **Expandable for long verbose fields.** `traditional_use` and `dosing_notes`
  render inside `<blockquote expandable>` (collapsed-by-default, tap to expand).
  This keeps the card scannable and under budget without truncation, and becomes
  the reusable "long field" convention for later phases.
- **Disclaimer in `<blockquote>`**, appended outside the truncated region so it
  is never cut (ADR 006 invariant preserved).

## Phases

> Single-phase plan. Sub-steps are an implementation order, not separate plans.

### Phase 1 — Render foundation + HTML-rendered formula card
*Owner: dev (with ux-telegram spot-check on the rendered card).*

**Deliverables:**

1. **`src/bot/render/html.ts` (new)** — mirror serbian-bot `html.ts`:
   - `type Html = string & { readonly __brand: 'html' }`; `unsafeHtml(s)`.
   - `html` tagged template auto-escaping every interpolation via `escapeHtml`.
   - `replyHtml(ctx, body, extra?)` / `editHtml(ctx, body, extra?)` setting
     `parse_mode: 'HTML'` behind a scoped `eslint-disable-next-line
     no-restricted-syntax` with a justifying comment.
2. **`src/bot/render/markdown.ts` (extend)** — add, alongside the retained
   `toPlainText`/`clampToTelegram`:
   - `escapeHtml(s)` — escape `& < > "`.
   - `truncateRenderedHtml(html, max)` — tag-aware + entity-aware cut that closes
     open tags (port the serbian-bot implementation).
3. **`src/bot/render/anchor.ts` (extend)** — HTML-aware siblings
   `sendAnchorHtml` / `editAnchorHtml` / `editAnchorAtHtml`: identical to the
   plain trio but pass `parse_mode: 'HTML'`, use `truncateRenderedHtml` instead
   of `clampToTelegram`, and **preserve the "message is not modified" 400 swallow**
   (`anchor.ts:81`). Plain helpers stay untouched.
4. **`eslint.config.mjs` (edit)** — allow `parse_mode` in the seam files only
   (scoped `files` override or rely on the inline disables in `html.ts`/
   `anchor.ts`). The global ban (`src/bot/**`) otherwise stands. Confirm `npm run
   lint` is green and that a stray `parse_mode` elsewhere still errors.
5. **`src/bot/commands/_formula-card.ts` (rewrite `renderFormula` → `Html`)**:
   - Header: `🧪 <b>{nameRu}</b>`.
   - Italic original-names sub-line via `parseOriginalNames(nameOriginal)` (new
     helper in this file or a small `_formula-names.ts`), omitted when absent.
   - Tag line: `<i>{nature} · {tradition}</i>` (nature optional;
     `tradition()` from `keyboards.ts`).
   - `<b>Состав:</b>` then one `•`-bulleted line per composition entry, Latin
     parenthetical in `<code>` (best-effort).
   - `<b>Показания:</b> …` inline (indications), when present.
   - `traditional_use` / `dosing_notes` → `<blockquote expandable>` with the
     `formulaCard.use` / `formulaCard.dosing` labels, when present.
   - `⚠️ <b>Предостережения:</b> …` (cautions), when present.
   - Disclaimer in `<blockquote>`, appended **after** truncation so it is never
     cut. Members stay on the keyboard (`formulaCardKeyboard`, unchanged).
   - Every interpolated content value escaped (via `html` template / `escapeHtml`).
6. **`src/bot/messages.ts` (edit `formulaCard.*`)** — labels may now carry inline
   tags or be split into label + value; keep them centralized and Russian. Update
   builder signatures as the card requires (still no Russian strings in handlers).
7. **`src/bot/commands/library.ts` (edit)** — add `readonly html?: true` to
   `View`; set it on `formulaCardView`'s return; make the anchor dispatch (the
   `sendAnchor`/`editAnchor`/`editAnchorAt` call sites that render a `View`) pick
   the HTML-aware helper when `view.html` is set. All other `View`s unchanged.
8. **Tests** — update `_formula-card.test.ts` and add coverage:
   - Card contains `<b>…</b>` around `nameRu`, expandable blockquote around the
     `traditional_use`/`dosing` secrets, and the structured verbose labels (keep
     the existing live-review assertions).
   - **`sourceText` / raw `body` never appear** (keep the ADR 006 assertion).
   - Disclaimer present and last; HTML well-formed (no unclosed tag) after a
     forced truncation of an oversized card.
   - `parseOriginalNames`: a matching multi-script string compacts correctly; a
     non-matching string (`'A gar 8'`) falls back verbatim; special chars
     (`< > &`) in any field are escaped.
   - `truncateRenderedHtml`: cutting mid-tag/mid-entity yields valid HTML with
     tags closed (port serbian-bot cases).

**Acceptance:**
- A formula card in the live `🧪 Формулы` branch renders with bold name, italic
  original sub-line, bulleted composition, expandable verbose fields, distinct
  cautions and a blockquote disclaimer — verified manually in Telegram.
- Every **other** library surface (herb cards, lists, guides, search) renders
  identically to before (plain text; no literal tags, no double-escaping).
- A deliberately oversized formula produces valid, tag-closed HTML (no Telegram
  400), with the disclaimer intact.
- `npm run typecheck && npm run lint && npm test && npm run build && npm run
  content:index:check` — all green. ESLint still errors on a `parse_mode` placed
  outside the seam.

## Risks / Open questions

- **Escaping is the #1 risk (ADR 011).** One unescaped `< > &` in a field → the
  whole card fails to send (HTTP 400). Mitigation: all interpolation through the
  `html` template / `escapeHtml`; a test feeds metacharacters through every
  field. Latin names and Cyrillic carry none today, but the guarantee must hold
  for future content.
- **Shared anchor path.** The formula card shares `View` + anchor helpers with
  herb/guide/search branches. Flipping the wrong dispatch would render their
  plain text as literal-tag garbage or double-escape it. Mitigation: HTML is
  strictly opt-in via `view.html`; an acceptance check confirms a plain branch is
  byte-identical.
- **`name_original` shape variance.** The freeform string isn't guaranteed to
  follow `Монгольское:/Тибетские:/…`. Mitigation: parser falls back to escaped
  verbatim italic; never throws. Optionally log (debug) on fallback to surface
  how many formulas miss the shape — informs a possible Phase-2+ structured field.
- **`<blockquote expandable>` client support.** Renders as a normal blockquote on
  older clients (graceful). Acceptable; no fallback needed.
- **Length budget.** Expandable hides text **visually** but it still counts
  toward 4096/3800. `truncateRenderedHtml` is the backstop; spot-check the
  longest formulas (e.g. `agar-8`) stay well under budget.
- **ESLint exemption scope.** Keep the exemption to the seam files only; a
  too-broad `files` override would silently re-open the footgun. Verify with a
  negative test (a `parse_mode` added to a handler must fail lint).

## Verification

- `npm run typecheck && npm run lint && npm test && npm run build && npm run
  content:index:check` — green.
- Manual in Telegram (formula branch is live): open several formula cards
  (short + verbose, e.g. `agar-8`); confirm bold/italic/`<code>`/expandable/
  blockquote render as intended, member buttons still work, disclaimer present.
- Manual regression: open a herb card, a guide, a search results list — all
  unchanged plain text, no stray tags.
- Negative lint: add a throwaway `parse_mode` to a handler → `npm run lint`
  errors; remove it.

## Progress

- [x] Phase 1 — Render foundation + HTML formula card — `f5ace95` (impl) +
  `0d88824` (expandable-section indent fix). Notes: the `parse_mode` exemption is
  carried by scoped inline `eslint-disable`s in `html.ts`/`anchor.ts` (the
  plan-sanctioned "rely on the inline disables" path), so `eslint.config.mjs` was
  left unchanged — the global ban still errors on a stray `parse_mode` (negative
  test confirmed). The card's older `themes` line was dropped per the locked
  Phase-1 layout (deliverable 5). Awaiting architect review before close (minor
  bump + changelog entry).
