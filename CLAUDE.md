# CLAUDE.md

## Commit Message Guidelines

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat` — new feature
- `fix` — bug fix
- `refactor` — code change that neither fixes a bug nor adds a feature
- `docs` — documentation only
- `test` — adding or updating tests
- `chore` — build, tooling, config, dependencies
- `style` — formatting, whitespace (no logic change)
- `perf` — performance improvement
- `ci` — CI/CD changes

### Scopes

| Scope | Covers |
|---|---|
| `bot` | `src/bot/`, commands, middleware, messages, keyboards, payments |
| `content` | `content/`, `src/content/` loader, validation, index builders |
| `notify` | `src/notifications/` (pure scheduling), `src/services/` dispatch + budget |
| `db` | `src/db/` connection, schema, repositories |
| `services` | `src/services/` notifier, backups |
| `config` | `src/config.ts`, `.env.example`, tsconfig, eslint, docker |
| `deps` | dependency changes |

### Rules

- Subject line: imperative mood, lowercase, no period, max 72 chars
- Body: wrap at 72 chars, explain **why** not **what**
- Footer: reference issues (`Closes #123`) or note breaking changes (`BREAKING CHANGE:`)
- One logical change per commit — don't mix unrelated changes

### Examples

```
feat(notify): add recurrence parsing for daily user reminders

feat(bot): add /reminders command to list and cancel schedules

chore(deps): add gray-matter for markdown frontmatter parsing

refactor(content): extract herb validator into dedicated module
```

## Commit Hygiene

- Always check `git status` before committing to avoid sweeping up unrelated staged files from parallel sessions or prior work
- Do not split commits or add unrequested code fixes during a commit action unless explicitly asked
- Plans must be reviewed before being moved to `done/` — never auto-move

## Editing Workflow

- Always Read files before Editing them — batch Reads up front when touching multiple files
- Apply patch version bumps for bugfixes by default (semver standard) without waiting to be told

## Commit timestamps are backdated automatically

A PreToolUse hook in `.claude/settings.local.json` (→ `.claude/hooks/backdate-commit.js`)
rewrites every `git commit` command to set `GIT_AUTHOR_DATE` and `GIT_COMMITTER_DATE`
to a random time in today's 19:00–23:00 local window, and **auto-approves** that
commit (`permissionDecision: "allow"`) so commits don't prompt. This is intentional.

- **Just run `git commit` normally.** Don't set the env vars yourself.
- **Don't be surprised by evening timestamps** in `git log`. They're correct.
- **Run `git add` and `git commit` as separate Bash calls** — the hook filter matches
  commands that *start with* `git commit`, so `git add . && git commit ...` bypasses it.

## Project notes

- **Russian UI only.** All user-facing strings live in `src/bot/messages.ts`. Never hardcode Russian strings inside command handlers. Tone is polite "вы".
- **Content is read-only at runtime.** Markdown files in `content/` are loaded once at boot. The DB stores only user state. Content `id`s are stable join keys — never rename them.
- **Tibetan-only user surface (ADR 013).** The bot presents as a **Tibetan**-medicine reference. Chinese (TCM) records are **authored-but-gated**: the files (`content/herbs/chinese/*.md`) and their committed index entries are **kept, not deleted**, but a single content-load visibility gate (`src/content/visibility.ts → VISIBLE_TRADITIONS = ['tibetan']`) drops them before buckets/cross-links/validation, so nothing downstream (lists, categories, search, cards, cross-links) can surface them. The index builder opts out via `loadContent(dir, { includeHiddenTraditions: true })` so the full corpus stays indexed. The `Tradition` type still reads `'chinese' | 'tibetan'`; **re-enabling Chinese is a one-line flip — it is gated by deliberate choice, not an oversight. Do not re-surface it without an explicit owner request.**
- **Informational, not medical advice.** This bot is an educational reference about traditional-medicine practices. The **production** bot must never present content as diagnosis or treatment. The standard disclaimer (`src/bot/messages.ts → disclaimer`) is appended **by the bot at render time** and is **scoped (2026-06-29, amends ADR 006 #2/#4) to the formula (составы) card + `/start` + `/help` only** — it is *no longer* on ingredient (herb), food, or guide cards (tips never carried it), and is no longer baked into any content file (ADR 006, amends ADR 002). Rationale: showing it once on entry plus on the clinically sensitive formula surface is enough; trailing every harmless descriptive page was excessive. **Staging exception (ADR 006):** the `content/combinations/` corpus may hold **verbose, non-sanitised source data** (indications, traditional usage, source text) **for review by a qualified Tibetan-medicine practitioner before production**. This is a staging artifact behind a **hard production gate** — nothing reaches the production bot without the owner's documented sign-off. Outside that gated corpus, keep framing descriptive ("traditionally used for…"), never prescriptive.
- **Content index at `content/.index/`** is a generated, committed cross-file lookup (`herbs.json`, `combinations.json`, `categories.json`, `tips.json`, `guides.json`, `foods.json`). Regenerated by `npm run content:index`; the pre-commit hook keeps it in sync, CI guards against drift via `content:index:check`. Categories are generic (ADR 007): a `Category` can group herbs **and** combinations (`combinationCount`); a combination may carry an optional `category` (e.g. `rinchen-pills`) and a `nature` («Сущность») value.
- **Guides are long-form articles (ADR 008, Plan 006).** A `guide` is a *pull* content type under `content/guides/<tradition>/<id>.md`: frontmatter (`id`, `tradition`, `title`, optional `source` reusing `TipSource`, `tags`) plus a markdown body **split into ordered sections on `##` headings** (text before the first `##` is the intro section; `###`+ stay inside a section). Browsed via the 📖 Статьи branch of the library hub / `/guides`; delivered one pager page at a time, **exempt from the proactive budget**. The render-time disclaimer (ADR 006) is appended on the final page, never baked into the body.
- **Foods are a structured, queryable content type (ADR 012, Plan 013).** A `food` lives under `content/foods/<tradition>/<id>.md` (`id` prefixed `food-`): frontmatter only — `name_ru`, `group` (one of 10 `FoodGroup`s), `warmth` (5-level), optional `heaviness`, `tastes`, per-начало `constitutions` effects (`pacifies`/`neutral`/`aggravates` on canonical `wind`/`bile`/`phlegm` keys — glossed Желчь≈Огонь, Слизь≈Земля-Вода once per surface), descriptive `effect`, optional `cautions`, `source` (`TipSource`), `tags`. Per-record schema is validated at parse time in `loader.parseFood` (file-pathed fail-fast). Browsed/filtered via the **🥗 Продукты** library branch / `/foods` (browse by group, or filter by which начало a food pacifies / by warmth band); pull-only, budget-exempt, render-time disclaimer on the card. Food entries describe *properties*, never "при болезни X ешьте Y" — the same non-medical-advice guard as the rest of the corpus.
- **Combination source fidelity (ADR 006 staging).** The authoritative re-capture of every formula's source is `research/raw-crawl-verbose-v2.json` (Plan 004); the older `raw-crawl-verbose.json` is **not** faithful (it was LLM-condensed). `manla.ru` is canonical for dual-source formulas. `npm run content:review` rebuilds the doctor-facing review HTML under `research/_private/` (gitignored) for each fix→re-audit round.
- **Plans live in `docs/plans/`**, ADRs in `docs/adr/`, architecture docs in `docs/architecture/`. Approved plans drive implementation; the dev skill must not deviate without flagging the user.

## Notification model (three paths)

The headline feature. Three delivery paths, all behind the `Notifier` interface
(`src/services/notifier.ts`, ADR 003) so no Telegraf leaks into the domain:

- **Solicited** — user-scheduled reminders. `services/reminder-dispatch.ts` runs
  a frequent cron tick, delivers due rows from `scheduled_reminders`, then
  advances `next_fire_at` via the pure `notifications/recurrence.ts`. **Not**
  subject to the daily cap — the user asked for these.
- **Proactive** — daily tips / topic digests. `services/subscription-dispatch.ts`
  routes every send through `services/notification-budget.ts`, which enforces
  **≤1 proactive push per user per calendar day** (ADR 004) and records to
  `notification_log`. Any new **proactive** (recurring, bot-initiated) surface
  must route through this gate.
- **Broadcast** — post-deploy "what's new" announcements. `services/version-announcer.ts`
  runs once at boot and pings every active user whose `users.notified_version`
  is behind the current `package.json` version, delivering the per-version
  `messages.versionAnnouncements` strings (multi-version queue ≤3, oldest-first,
  spaced; opt-in `feature_announcements` default off; `priority: true` bypasses
  the opt-out). **Notifier-direct, exempt from the daily cap** (ADR 010) — it's a
  one-shot-per-version event made idempotent by the `notified_version` watermark,
  not by the budget. `/changelog` shows the history. Minor/major plan-closes add
  an entry to the map (see the architect close ritual); patch closes stay silent.

## Navigation model (ADR 009)

The bot spine is a **persistent reply-keyboard main menu + inline drilldown**
(Plan 007). When adding or changing a screen, follow the established kit instead
of reinventing routing/session/render:

- **Menu = exact-match routing.** `mainMenuKeyboard()` (`keyboards.ts`) labels
  live in `messages.menu`; `menu-router.ts` routes each via
  `bot.hears(exact(LABEL), …)` to the **same `*Entry` function** the slash
  command calls — keep the two in lockstep. A menu tap disposes open sessions
  (`disposeAllSessions`) before dispatch.
- **Anchor-edit drilldown.** A multi-step flow sends **one** message (the anchor)
  via `sendAnchor` and edits it on each step via `editAnchor` (`render/anchor.ts`,
  plaintext, ADR 002) — never a new message per step. Persist the anchor +
  per-flow state as an `AnchoredSession<S>` (`session-store.ts`), keyed by
  internal `user_id` (ADR 003), TTL `SESSION_TTL_MS`.
- **Callback prologue.** Every inline-button handler starts with
  `requireSessionAndAnchor(ctx, kind)` (`commands/_callback-prologue.ts`): it
  validates the user, the live session, and that the tapped message **is** the
  anchor. Stale taps ack silently and no-op.
- **Callback-data convention:** `<scope>:<action>:<arg?>` (e.g. `br:herb:<id>`,
  `set:tip:toggle`), **≤64 bytes** — run payloads through `assertCallbackData`
  and use stable content `id`s/indices, never titles. Scopes in use: `br`
  (browse), `se` (search), `set` (settings), `ob` (onboarding), `herb`/`remind`
  (global CTA), `rc` (reminder-create wizard), `sub`/`unsub`, `donate`.
- **Gated surfaces.** The combinations (formula) browser sat behind the ADR 006
  doctor-gate — one compile-time constant, `src/bot/commands/_formula-gate.ts →
  FORMULA_BRANCH_ENABLED` (not a runtime/env flag), gating all three surfaces:
  the `🧪 Составы` hub branch, formula search hits, and the herb-card "Входит в
  составы" cross-links (the formula callback handlers are only registered when it
  is `true`, so a hand-crafted `lib:formula:*` tap can't leak while off). **The
  gate was lifted on the owner's documented sign-off (2026-06-28,
  `docs/medical-review.md`):** `FORMULA_BRANCH_ENABLED = true`, the branch is live,
  and the formula card surfaces the structured set
  (name/nature/composition/member cross-links/themes/cautions) **plus, as of
  2026-06-29, the structured verbose fields** (indications/traditional use/dosing)
  as a **live-review surface** on the private pre-launch bot. Only the raw
  `source_text`/`body` stay unsurfaced; final production sign-off of the verbose
  fields is still pending (`docs/medical-review.md`). **The branch is *labelled*
  «Составы» in the UI (Plan 017) while all code, callbacks, ids, and the
  `Combination` type keep the "formula/combination" vocabulary** — a deliberate
  display-only split; do not chase a full rename of the stable join keys. It also
  carries a formula-only 🔎 search (`lib:fsearch`/`lib:fresults`) reachable from
  the top of the list, *in addition to* the unified top-level 🔎 Поиск.
- **The 🌿 herb branch is *labelled* «Ингредиенты» (Plan 019)** — same
  display-only split: code, callbacks (`lib:herb:`), the `tib-` ids, the
  `content/herbs/` dir and the `Herb` type keep "herb" vocabulary, while minerals/
  resins/animal materia medica (e.g. `tib-shilajit`, `tib-calcite`, `tib-musk`)
  are authored as `herb`-typed content. Formula→ingredient cross-links resolve
  from each formula's `members:`, backfilled from its `composition:` Latin
  binomials by `npm run content:members` (map: `research/ingredient-member-map.json`).

## Portability discipline (ADR 003)

- **Internal `user_id` is the primary key on `users`.** Telegram ID lives in `auth_identities`, never as a PK.
- **No Telegraf imports outside `src/bot/`** (and the boot entry `src/index.ts`). `src/notifications/`, `src/content/`, `src/services/` are framework-free. The ESLint config enforces this.
- **Dispatch schedulers depend on the `Notifier` interface**, not on `bot.telegram.sendMessage`. The Telegraf-backed implementation lives in `src/bot/notifier.ts`.
- **Content markdown stays renderer-agnostic** — no Telegram escape rules or `parse_mode` markup in content bodies. Rendering quirks belong in the bot layer (ADR 002).

If a planned change would violate any of these, flag it and update the relevant ADR rather than silently breaking the rule.

## Telegram constraints

- Messages have a ~3800-character practical limit (`TELEGRAM_LIMIT`). For long sends use `splitForTelegram` (`src/bot/render/markdown.ts`) — the sanctioned multi-message splitter (paragraph-packing, loses nothing); message-splitting is no longer "deferred". `clampToTelegram` stays for single-card surfaces (herbs/combinations/tips).
- `callback_data` is capped at **64 bytes** — guard every payload with `assertCallbackData` (`keyboards.ts`).
- YAML frontmatter values containing colons must be quoted to avoid parsing errors.
