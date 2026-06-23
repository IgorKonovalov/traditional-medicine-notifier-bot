# ADR 001 — Tech stack

**Date:** 2026-06-23
**Status:** Accepted

## Context

A new Telegram bot for traditional-medicine reference + notifications. We want a
small, boring, proven stack that a single maintainer can run cheaply on a shared
droplet, and that matches the sibling `serbian-language-bot` so operational
knowledge transfers.

## Decision

- **Runtime:** Node.js 22, TypeScript 6 strict (CommonJS, ES2022 target).
- **Bot framework:** Telegraf 4.16, **long polling** (no public HTTP endpoint to secure).
- **Storage:** better-sqlite3 (synchronous, WAL mode), raw SQL via per-concern repositories. No ORM.
- **Scheduling:** node-cron, in-process (two dispatch ticks: solicited reminders, proactive tips).
- **Logging:** pino, structured single-line JSON.
- **Tests:** Vitest + v8 coverage, real in-memory SQLite (no DB mocks).
- **Lint/format:** ESLint flat config (type-aware) + Prettier + Husky.
- **Deploy:** Docker Compose on a DigitalOcean droplet; GitHub Actions runs the check gate (deploy job is enabled when ready).

## Consequences

- Single process, single SQLite file — trivial ops, daily file backup is sufficient.
- Synchronous DB calls keep handlers simple; WAL + `busy_timeout` tolerates the cron/handler write overlap.
- Polling means no inbound network exposure; the trade-off is the bot must be running to receive updates (acceptable).
- Mirrors the sibling bot, so deploy/runbook knowledge is shared.

## Alternatives considered

- **Postgres / an ORM** — overkill for a single-tenant bot at this scale.
- **Webhooks** — needs a public TLS endpoint and reverse proxy; polling avoids that for no real cost here.
- **A managed scheduler** — node-cron in-process is enough; revisit only if dispatch needs to scale out.
