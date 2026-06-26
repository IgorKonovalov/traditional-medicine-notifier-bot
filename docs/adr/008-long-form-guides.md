# ADR 008 — Long-form guides: a pull content type with paginated, split delivery

**Date:** 2026-06-26
**Status:** Accepted

## Context

The corpus has four content shapes today: **herbs** and **combinations**
(single-card lookups), **categories** (subscription keys), and **tips** (short
~600-char notes pushed once a day). A new need does not fit any of them:
**long-form reference articles** — e.g. the `https://manla.ru/info/` Sova-Rigpa
sections on seasonal eating, daily conduct, water procedures. One such section
runs **~3,000 words** with a multi-row table. The owner wants these surfaced as
"a list of helpful pages" the user pulls up and reads — a handbook, not a nudge.

Forces that make this non-obvious / costly to reverse:

- **Telegram's ~3800-char practical limit.** The bot today **clamps**
  (`clampToTelegram` in `src/bot/render/markdown.ts` hard-truncates on a word
  boundary) — it does **not** split. A ~18,000-char article would be guillotined.
  CLAUDE.md has repeatedly deferred "message splitting — separate effort"; a
  guide forces the issue.
- **Renderer-agnostic content (ADR 002).** Bodies must stay free of Telegram
  markup; splitting/pagination is a bot-layer concern.
- **A browsable index** is required — the "list of pages" entry point — which is
  new stateful navigation the bot has not done (its cards are single replies).
- **Non-medical-advice invariant** (CLAUDE.md) and **honest sourcing**
  (content-curator Rule 2): manla.ru is a commercial clinic site, so guide prose
  must be **paraphrased** and **attributed to the tradition**, never imported
  verbatim or framed as instruction.
- **Proactive budget (ADR 004)** governs *pushed* surfaces; a pulled article
  must not be entangled with it.

## Decision

Introduce **guides** as a fourth *pull* content type, delivered as authored
sections with a paginator and a generic splitter safety net.

1. **New `Guide` content type.** Add to `src/content/types.ts`: a `Guide`
   (`id`, `tradition`, `title`, optional `source` reusing the `TipSource` shape,
   optional `tags`, and an ordered `sections: GuideSection[]`) and a
   `GuideSection` (`heading`, `body` — renderer-agnostic markdown). Extend
   `LoadedContent` with a `guides` `ContentBucket<Guide>`.

2. **The section is the unit of delivery.** Each section is authored to fit
   within `TELEGRAM_LIMIT`. A guide is sent **one section per message**, so the
   author controls where breaks fall and each message stays coherent. Source
   files live at `content/guides/<tradition>/<id>.md`; the section delimiter
   convention (e.g. `##` headings split a single body into sections) is fixed in
   the implementation plan.

3. **Hybrid splitting.** Add a generic `splitForTelegram(text): string[]`
   (paragraph-boundary chunking) to `src/bot/render/markdown.ts` as a **safety
   net** for any section that still exceeds the limit. `clampToTelegram` stays
   for single-card surfaces (herbs/combinations/tips); guide sends route through
   `splitForTelegram`. Long sends must never be sent ad hoc — they go through
   this helper.

4. **Browse + pager UX.** A browse entry (`/guides` or a "📚 Статьи" branch in
   `/browse`) lists guide titles as buttons; tapping opens section 1 with inline
   ◀ ▶ and "к списку" navigation. Pagination state reuses the existing
   `session-store.ts` machinery via a new `SessionKind` (`'guide'`). All Russian
   strings live in `messages.ts`.

5. **Guides are pulled, not pushed.** They are **exempt from the proactive
   budget** (ADR 004) — the user navigates to them. They are **independent of
   tips**: a tip *may* deep-link to a guide section, but the two are authored
   separately (Plan 005 proceeds unchanged).

6. **Framing & disclaimer.** Guide prose is descriptive and tradition-attributed
   (non-medical-advice invariant; Rule 2). The standard disclaimer is appended
   **at render time** (ADR 006 pattern), once per guide (recommended: trailing
   the final section), never baked into the markdown.

Concrete surface a reviewer can grep against:
`src/content/types.ts` (Guide/GuideSection), `loader.ts` (`parseGuide`),
`validate.ts` (unique ids, tradition enum, non-empty sections),
`index-builders.ts` + `content/.index/guides.json`,
`content/guides/<tradition>/<id>.md`, `src/bot/render/markdown.ts`
(`splitForTelegram`), `src/bot/commands/guides.ts`, `src/bot/session-store.ts`
(`SessionKind 'guide'`), `messages.ts`.

## Consequences

- **Easier:** a real home for rich reference material; a sanctioned, reusable
  message-splitter the whole bot can adopt; natural cross-linking from tips into
  deeper guides.
- **Harder:** the bot's **first stateful multi-message navigation** (pager state,
  `callback_data` length budget, edit-vs-resend choices); meaningful **authoring
  cost** (paraphrasing thousands of words per source page, descriptively); one
  more content type the index builders and `content:index:check` drift guard must
  cover.
- **Every future change must:** keep guide bodies renderer-agnostic (ADR 002);
  route any long send through `splitForTelegram`, never clamp-and-hope or set
  `parse_mode` ad hoc; keep guides out of the proactive budget (ADR 004); and
  hold the non-medical-advice line in guide prose.

## Alternatives considered

- **Stretch the `tip` type (longer bodies).** Rejected: tips are short daily
  *pushes* with rotation and budget semantics; the clamp truncates them; a
  3,000-word "tip" is a category error.
- **Model the data structurally (season × facet tables).** Rejected for v1 as
  over-engineering — markdown sections suffice under ADR 002. Revisit only if a
  query/filter need appears.
- **Burst delivery without authored sections** (split a monolithic body and fire
  all chunks). Rejected: chat spam, rate-limit risk, and no navigation — the
  paginator is the point.
- **Just link out to manla.ru.** Rejected: sends users off-platform to a
  commercial site, surrenders control over content and longevity, and forfeits
  the paraphrased, tradition-attributed framing the invariant requires.

## References

- ADR 002 (renderer-agnostic content) · ADR 004 (proactive budget — guides
  exempt) · ADR 006 (render-time disclaimer pattern).
- Plan 003 (structured `TipSource`, reused here) · Plan 005 (tip expansion —
  proceeds independently).
- ADR 007 is reserved by Plan 004 (combination categorization / rinchen); this
  ADR takes **008** to avoid collision.
- Implementation plan: forthcoming (Plan 006 — long-form guides).
