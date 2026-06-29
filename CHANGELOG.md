# Changelog

All notable changes to this project are documented here. The project follows
[Semantic Versioning](https://semver.org/). `package.json` is the source of
truth for the current version.

## 0.17.0 — 2026-06-29

- Add two foundational theory guides (Plan 016 Wave 1): «Шесть вкусов» (the
  six tastes, their element pairs and action on the three начала) and «Как
  возникает болезнь» (how the tradition explains disease as accumulated
  imbalance of Ветер/Желчь/Слизь). Both are source-cited, descriptive, and
  end at render time with the standard disclaimer (ADR 006, ADR 008).
- Cross-link the new guides into `tib-osnovy` and deep-link `tip-007` to
  «Шесть вкусов». Content index now carries 6 guides.

## 0.16.0 — 2026-06-29

- Make the user-facing surface **Tibetan-only** (ADR 013, Plan 015). A single
  content-load visibility gate (`src/content/visibility.ts` → `VISIBLE_TRADITIONS`)
  drops Chinese (TCM) records before buckets/cross-links/validation, so no
  list, category, search, card, or cross-link can surface them — by construction.
- Replace the Herbs «По традиции» picker with a flat **«Все травы»** list; keep
  «По категории». `/start` and `/help` now present the bot as a Tibetan-medicine
  reference.
- Chinese herb files and their committed index entries are **kept, not deleted**
  (the index builder opts out of the gate via `includeHiddenTraditions`); the bot
  is Tibetan-only by deliberate choice and re-enabling Chinese is a one-line flip.

## 0.15.1 — 2026-06-29

- Render the formula card's traditional-use / dosing as plain bold-labelled
  sections instead of expandable quotes, so the disclaimer is the only blockquote.
- Fix the herb card crashing («Что-то пошло не так») for a herb that belongs to
  many formulas: the reverse cross-link buttons (≈94 for Миробалан хебула) built
  an inline keyboard Telegram rejects. Cap them at 8 and label the section
  «показаны N из M»; the rest stay reachable via search.

## 0.15.0 — 2026-06-29

- Render the **formula card as rich Telegram HTML** (ADR 011, Plan 014 Phase 1):
  bold name, italic original-names sub-line, bulleted composition with Latin in
  monospace, traditional-use/dosing folded into expandable quotes, and the
  disclaimer in a blockquote. Adds a centralized, escaping-safe `Html` render
  seam (`render/html.ts` + HTML-aware anchor helpers); `parse_mode` stays banned
  everywhere outside the seam. Every other library surface is unchanged plain text.

## 0.14.0 — 2026-06-29

- Add **long-form guides** (ADR 008, Plan 006): a new pull content type browsed
  via the 📖 Статьи branch of the library hub (and `/guides`), read one section at
  a time with a ◀ ▶ pager. Ships three Tibetan guides — the flagship «Основы
  тибетской медицины» (три начала, первоэлементы, Жар/Холод, конституция),
  «Питание и образ жизни по сезонам» and «Распорядок дня» — grounded in Чжуд-ши
  and written in the source-faithful clinical register (Plan 012), descriptive
  throughout. Introduces `splitForTelegram`, the sanctioned message splitter for
  long sends.

## 0.13.0 — 2026-06-29

- Expand the 🧪 formula cards to surface the structured verbose fields — показания
  (indications), применение (traditional use) and приём (dosing) — below the
  existing set, as a **live-review surface** on the private pre-launch bot (owner
  sign-off 2026-06-29) so the corpus can be reviewed in situ before large
  production. The raw source text / verbatim body stay unsurfaced and the
  render-time disclaimer is unchanged (ADR 006, `docs/medical-review.md`). Card
  rendering and the inverted raw-body-never-surfaces test shipped in `0052711`;
  this is the release close.

## 0.12.0 — 2026-06-29

- Rewrote all 60 daily tips into a source-faithful clinical register (named
  ньепа / пищеварительный огонь / Жар-Холод, single attribution, no scare-quotes
  on terms), retiring the earlier soft "new-age" voice; re-cited 20 Сова-Ригпа
  tips to real «Наука о здоровье» (Ринчен Тензин) chapters and kept 10 on the
  manla citation where the book has no clean counterpart (Plan 012).

## 0.11.2 — 2026-06-28

- Apply the practitioner's medical-review verdicts to the formula corpus
  (`docs/medical-review.md`). **Group 1 (toxic constituents):** aconite confirmed
  present in `agar-35`, `garuda-5`, `olse-25`, `tcovo-8` — added to each
  `composition` (agar-35 keeps nux vomica too) and the interim caution is now
  toxin-specific. **Group 5:** normalized the binomial `Terminalia belerica →
  bellirica` corpus-wide. Groups 2–4 accepted as-is, Group 3 components kept
  dropped (manla-canonical), Groups 6–7 deferred to the pre-large-production
  review.

## 0.11.1 — 2026-06-28

- Add an interim defensive caution to four formulas carrying unresolved
  toxic-constituent flags (`agar-35`, `garuda-5`, `olse-25`, `tcovo-8`) — it
  flags the potent components in the now-live formula card pending practitioner
  confirmation of the aconite-vs-strychnine discrepancy (ADR 006 review ongoing,
  `docs/medical-review.md`).

## 0.11.0 — 2026-06-28

- Unified **📚 Библиотека** surface (Plan 009): a hub gathering herbs (browse by
  tradition or category), an integrated 🔎 search, the day's tip, and the
  **🧪 Формулы** browser — all on the anchor-edit navigation kit, superseding the
  old `/browse` and `/search` flows. Herb cards gain a render-time "Входит в
  формулы" cross-link section and formula cards cross-link back to their member
  herbs (boot-time `crossLinks` reverse index). The combinations browser was
  built behind the ADR 006 doctor-gate (`FORMULA_BRANCH_ENABLED`) and **lifted on
  owner sign-off** (`docs/medical-review.md`), surfacing only the minimal field
  set — name, nature, composition, member cross-links, themes, cautions — with
  the verbose review-pending fields kept unsurfaced.

## 0.10.0 — 2026-06-28

- Retired the topic-subscriptions surface and added an optional herb link to the
  reminder wizard (Plan 011). The unused per-category subscriptions UI
  (`/subscriptions` + the Settings → Подписки entry) is removed — nothing
  dispatched a digest and the daily-tip path runs off the settings toggle, so it
  stays intact (the `subscriptions` table is retained, dead, under the
  additive-only rule). Creating a reminder from scratch (⏰ Напоминания → ➕
  Новое) now offers an optional paginated herb picker between the label and
  schedule steps, with a "Пропустить" skip; the herb-card ⏰ Напомнить path is
  unchanged (herb pre-linked, picker skipped), and the confirm screen shows the
  linked herb when one is attached.

## 0.9.0 — 2026-06-28

- Greatly expand the daily-tip pool from 10 to 60 tips (Plan 005). Adds 20 new
  Чжуд-ши tips (deepening the seasonal, conduct, eating-manner and six-tastes
  chapters) and 30 new Сова Ригпа (manla.ru) tips on constitution-based
  nutrition, water, sleep, daily conduct and seasonal behaviour — a ~2-month
  no-repeat rotation. All framing stays descriptive (non-medical-advice
  invariant); prescriptive source topics (weight, fasting, mono-diets) are
  recast descriptively with doctor pointers on the riskiest.

## 0.8.0 — 2026-06-28

- Post-deploy version broadcast (Plan 010, ADR 010). On boot the bot now pings
  active users about each new minor/major release they haven't seen — a
  multi-version queue (≤3, oldest-first, spaced), gated by a default-off
  `feature_announcements` opt-in with a `priority` bypass, idempotent via a new
  `users.notified_version` column (migration 002) and delivered Notifier-direct,
  exempt from the daily proactive cap (third notification path). Adds a
  `/changelog` command (plaintext release history), a "new features" toggle in
  ⚙️ Настройки, and a version footer in `/help`.

## 0.7.2 — 2026-06-28

- Fix dead-end feedback: the ✉️ Обратная связь button and bare `/feedback` now
  arm a one-shot text capture, so the follow-up message is actually received —
  relayed to the admins in `ADMIN_TELEGRAM_IDS` (and logged) instead of silently
  dropped. The inline `/feedback <text>` form also relays to admins now.

## 0.7.1 — 2026-06-28

- Fix ragged mid-sentence line breaks in rendered content (daily tips, herb
  cards): `toPlainText` now joins ~72-char soft-wrap newlines into spaces while
  preserving blank-line paragraph breaks.

## 0.7.0 — 2026-06-28

- Create-reminder wizard (Plan 008) — the headline solicited-notification path is
  now fully wired. An anchor-edited flow (label → recurrence kind → time(s) →
  date/weekdays → confirm) builds a `scheduled_reminders` row reachable from three
  entry points: the ⏰ Напоминания menu hub, the `/reminders` list, and a herb
  card's ⏰ Напомнить (pre-links the herb and offers its name as the default
  label). Free-text label capture is a tightly-scoped `on('text')` claim active
  only while a create session sits on the label step. The `/reminders` list renders
  each row's human-readable schedule and next fire; reminders bypass the proactive
  daily cap (ADR 004).

## 0.6.0 — 2026-06-28

- Navigation shell & UX foundation (Plan 007, ADR 009). The bot gains a
  **persistent reply-keyboard main menu** (📚 Библиотека · ⏰ Напоминания ·
  💡 Советы · ⚙️ Настройки · ❓ Помощь) routed by exact match to the same entry
  functions as the slash commands. Browse/search/herb are migrated onto an
  **anchor-edit drilldown** — one message edited in place per session, with
  universal `« Назад`/home and paginated lists — backed by a shared navigation
  kit: anchor render helpers, an `AnchoredSession` model, a
  `requireSessionAndAnchor` callback prologue, and back/home/pager builders with
  a 64-byte `callback_data` guard. Settings becomes a state-reflecting hub;
  `/start` is a stepped, idempotent onboarding; a minimal `/tips` entry backs the
  Советы button.

## 0.5.1 — 2026-06-27

- Sort the content-loader directory walk so corpus traversal — and the
  generated `content/.index/` — is deterministic across platforms.
  `readdirSync` is NTFS-sorted on Windows but inode-ordered on Linux, which
  made `combinations.json` drift on CI. Regenerated the index in canonical
  order and added a regression test.

## 0.5.0 — 2026-06-26

- Restore source fidelity across the Tibetan-formula corpus and remediate the
  doctor review (plan 004): pruned to 150 formulas, re-captured every record
  verbatim from its authoritative source (`research/raw-crawl-verbose-v2.json`,
  manla-canonical for dual-source), added a structured `nature` field and a
  generic combination `category` with the `rinchen-pills` class (ADR 007),
  normalized ingredients (Russian-first) / cautions (de-boilerplated) /
  capitalization, and committed a reproducible review-HTML generator
  (`npm run content:review`). Verbose corpus stays behind the ADR 006 gate.

## 0.4.0 — 2026-06-26

- Add a structured `source` field to daily tips (plan 003): tip provenance now
  lives in frontmatter and is rendered as an `Источник:` line by the bot at send
  time instead of being baked into the body. The 10 «Чжуд-ши» tips carry their
  chapter citation; `tips.json` projects it.

## 0.3.0 — 2026-06-25

- Re-extract the Tibetan formula corpus verbosely (ADR 006): 163
  `content/combinations/` records now carry full source indications, traditional
  use, dosing notes, and verbatim text behind a doctor-review production gate
  (`docs/medical-review.md`). The disclaimer is now appended by the bot at render
  time instead of baked into each content file.

## 0.2.0 — 2026-06-25

- Add the `combinations` content type (ADR 005) and sweep 144 Tibetan compound
  formulas from manla.ru + bimala.ru into `content/combinations/` — descriptive,
  non-prescriptive records with member→herb cross-references.

## 0.1.0 — 2026-06-23

- Initial project skeleton for the traditional-medicine notifier domain.
- Architectural seams in place (Notifier interface, content loader, DB
  migration framework, two-path notification dispatch) with feature bodies
  stubbed.
- Skill set under `.claude/skills/` (architect, dev, ux-telegram,
  content-curator) and seed ADRs under `docs/adr/`.
