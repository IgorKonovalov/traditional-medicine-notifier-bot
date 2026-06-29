# ADR 011 — Rich-text Telegram-HTML rendering behind a branded `Html` seam

**Date:** 2026-06-29
**Status:** Accepted (Plan 014 approved 2026-06-29)

## Context

ADR 002 delivers all content as **plain text** and **bans `parse_mode` in
`src/bot/`** (ESLint `no-restricted-syntax`, `eslint.config.mjs`). Emphasis is
carried by words and emoji. That kept the corpus renderer-agnostic and dodged
escaping bugs while the bot was young.

The content is, however, richly structured — formula cards alone carry name(s),
nature, an 8-item composition, indications, traditional-use and dosing text — and
flattening it all to `Label: a, b, c` lines reads as a wall of text and is hard
to remember. We want **bold/italic/monospace/blockquote/expandable** formatting
to make pages memorable.

ADR 002 explicitly **reserved this path** (its §Consequences): *"If rich
formatting is ever needed, it must be added behind the one render helper, never
via ad-hoc `parse_mode` in a handler."* This ADR exercises that clause. The
sibling **serbian-language-bot** runs exactly this design in production (its
ADR 008); we mirror it.

The risk that made ADR 002 ban `parse_mode` wholesale is real: a single
unescaped `<`, `>` or `&` in interpolated content makes Telegram reject the whole
message with HTTP 400, so the page fails to send. The mitigation is to make
"unescaped string reaches a send site" **unrepresentable**, not merely
discouraged.

## Decision

1. **`parse_mode: 'HTML'` is permitted only inside the centralized render/send
   helpers** — `src/bot/render/html.ts` and the HTML-aware anchor helpers in
   `src/bot/render/anchor.ts`. Everywhere else in `src/bot/` the ESLint ban
   stands. The helper files carry a scoped `eslint-disable` with a justifying
   comment (the serbian-bot precedent), so the rule stays globally enforced.

2. **A branded `Html` type is the only currency the HTML send path accepts.**
   `type Html = string & { readonly __brand: 'html' }`. The single ways to mint
   an `Html` are the auto-escaping `html` tagged template and (Phase 3)
   `renderMarkdownToTelegramHtml`. A raw `string` can be passed too, but the
   convention and the helpers funnel content through the escaping mint — a plain
   interpolation cannot reach Telegram unescaped without going through
   `escapeHtml`.

3. **Every interpolated value is HTML-escaped** at the render boundary via
   `escapeHtml` (`& < > "`). Static template parts (from source) are trusted.

4. **Truncation on the HTML path is tag-aware** (`truncateRenderedHtml`): it
   never cuts inside a tag or an entity and closes any tags left open. The plain
   word-boundary `clampToTelegram` is **not** safe for HTML (it would slice
   `<b>foo` and emit invalid markup) and is retired from HTML send paths.

5. **Content stays renderer-agnostic markdown (ADR 002 unchanged on that
   point).** Authors never write Telegram HTML in `content/`. HTML is produced at
   render time only — from structured frontmatter (formula card) or, from
   Phase 3, by converting markdown bodies. The corpus remains portable to a
   future non-Telegram client.

This ADR **amends ADR 002**: clause 2 of ADR 002 ("delivered as plain text") is
narrowed to "delivered as plain text **unless rendered through the centralized
HTML seam defined here**." ADR 002's content-is-markdown and
renderer-agnostic-bodies clauses remain in force.

## Consequences

- Bot replies/edits split into two lanes: **plain** (existing helpers, byte-for-
  byte unchanged) and **HTML** (`replyHtml`/`editHtml` + HTML-aware anchor
  helpers). A surface opts into HTML explicitly; nothing flips implicitly.
- Every value interpolated into HTML **must** pass through `escapeHtml` (the
  `html` template does this automatically). New HTML-emitting code that bypasses
  the template is a review red flag.
- Truncation budgets must be checked against the **rendered** HTML length, and
  structurally important trailers (the disclaimer) must sit outside the truncated
  region so they are never cut (carried over from ADR 006).
- The ESLint ban remains the default; the only sanctioned `parse_mode` sites are
  the named helper files. Adding a third is an architectural change, not a local
  edit.
- Portability (ADR 003) is unaffected: the HTML seam lives in `src/bot/`; the
  `Notifier` interface and the pure domain stay framework-free.

## Alternatives considered

- **Keep ADR 002 plain-text-only** — rejected: the structured medicine content
  is the headline reference surface and reads poorly flattened; ADR 002 itself
  reserved the upgrade.
- **Allow `parse_mode` ad hoc in handlers** — rejected: this is precisely the
  escaping-bug footgun ADR 002 banned. The branded-type + central-escape seam
  keeps the guarantee while unlocking formatting.
- **MarkdownV2 instead of HTML** — rejected: MarkdownV2 requires escaping a much
  larger metacharacter set inside content (`_ * [ ] ( ) ~ \` > # + - = | { } . !`),
  which is far more error-prone than HTML's `& < > "`. HTML's tag model also
  expresses `<blockquote expandable>` and `<pre>` cleanly.
- **Restructure content into HTML at author time** — rejected: couples the corpus
  to one renderer and breaks ADR 002 portability.

## References

- Plan 014 (rich-text formatting, Phase 1 — formula card + render foundation).
- ADR 002 (content in markdown, renderer-agnostic — amended here), ADR 003
  (portability), ADR 006 (render-time disclaimer + doctor-gate).
- serbian-language-bot ADR 008 + `src/bot/render/{html,markdown,anchor}.ts` — the
  production reference for this pattern.
