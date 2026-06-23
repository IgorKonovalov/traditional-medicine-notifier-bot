# ADR 002 — Content in markdown, renderer-agnostic (no `parse_mode`)

**Date:** 2026-06-23
**Status:** Accepted

## Context

The reference corpus (herbs, categories, tips) needs a home. Options: an external
CMS, a database table, or markdown files in the repo. We also need to decide how
content reaches Telegram without coupling the corpus to Telegram's formatting.

## Decision

1. **Content is markdown files under `content/`,** loaded once at boot into
   in-memory buckets (`src/content/loader.ts`). The database stores **only user
   state**. Content `id`s are stable join keys (reminders, deep links reference
   them) and are never renamed.

2. **Content bodies are renderer-agnostic.** They contain no Telegram-specific
   markup and the bot delivers them as **plain text** — `parse_mode` is **banned
   in `src/bot/`** (enforced by ESLint). Emphasis is carried by words and emoji.
   The single conversion point is `src/bot/render/markdown.ts`.

3. A committed, generated index (`content/.index/*.json`) is the cross-file
   lookup; CI guards drift via `content:index:check`.

## Consequences

- Authoring is a git workflow (the content-curator skill); no CMS to run.
- Content stays portable to a future non-Telegram client — no escape rules baked in.
- If rich formatting is ever needed, it must be added behind the one render helper, never via ad-hoc `parse_mode` in a handler.

## Alternatives considered

- **External CMS / DB-stored content** — adds infra and a runtime dependency for content that changes rarely and benefits from code review.
- **Telegram HTML/MarkdownV2 in content** — couples the corpus to one renderer and invites escaping bugs at every send site.
