# ADR 003 — Portability discipline (Notifier seam, framework-free domain)

**Date:** 2026-06-23
**Status:** Accepted

## Context

Telegram is the first channel, not necessarily the only one. We want the
domain logic (notification scheduling, content, persistence) to stay reusable if
a second client (mobile push, email digest, a web view) is ever added, and we
want the domain trivially unit-testable without a bot running.

## Decision

Four rules, the first three enforced by ESLint:

1. **Internal `users.id` is the primary key everywhere.** The Telegram id lives
   in `auth_identities.external_id` (TEXT), never as a primary key. A future
   auth provider is another `auth_identities` row.

2. **No Telegraf imports outside `src/bot/`** (and the boot entry `src/index.ts`).
   `src/notifications/`, `src/content/`, `src/services/` are framework-free.
   ESLint also bans imports from `src/bot/` *into* the domain layer.

3. **Delivery goes through the `Notifier` interface** (`src/services/notifier.ts`),
   never `bot.telegram.sendMessage` directly. The Telegraf-backed implementation
   is `src/bot/notifier.ts`; the dispatch schedulers and the budget gate depend
   only on the interface.

4. **The pure domain core uses no Node APIs.** `src/notifications/**`,
   `src/services/notifier.ts`, and `src/content/types.ts` must not import
   `fs`/`path`/`process`/`Buffer` (ESLint-enforced). Filesystem access for
   content lives only in `src/content/loader.ts`.

## Consequences

- A second delivery channel implements one interface; nothing else changes.
- Recurrence/scheduling/budget logic is pure and unit-tested without Telegraf or a real DB clock.
- The cost is a little ceremony (an interface + an adapter) that the ESLint rules keep honest.

## Alternatives considered

- **Call `bot.telegram` directly from schedulers** — simplest now, but welds the whole notification system to Telegraf and makes the domain untestable in isolation.
- **No pure-core restriction** — invites `Date.now()`/`fs` to creep into scheduling math, breaking determinism and portability.
