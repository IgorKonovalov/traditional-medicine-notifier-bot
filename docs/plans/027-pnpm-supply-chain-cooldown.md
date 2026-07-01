# Plan 027 — Migrate to pnpm + supply-chain release-age cooldown

**Status:** In progress — implementation complete, awaiting architect review/close
**Created:** 2026-07-01
**Completed:** —
**Bump on close:** patch

## Context

Two tooling changes, one plan because they land in the same set of files
(`package.json`, lockfile, Dockerfile, CI, hooks):

1. **Adopt pnpm** as the package manager in place of npm. pnpm gives a
   content-addressed store (faster, less disk), a stricter non-flat
   `node_modules` (no phantom dependencies), and — the reason that prompted
   this — first-class supply-chain controls.
2. **Enforce a minimum package release age ("cooldown").** Do not resolve any
   dependency version until it has been published for **≥ 7 days**. Most
   malicious npm releases (typosquats, compromised-maintainer publishes) are
   detected and yanked within hours; a multi-day cooldown filters out the entire
   class of "smash-and-grab" incidents at effectively zero cost. pnpm ships this
   natively as `minimumReleaseAge` (added v10.16, a default in v11).

This is an internal tooling/infra change with **no user-facing surface** → patch
bump, no version announcement (ADR 010). It does **not** touch the runtime,
content, or notification model.

The package-manager choice + cooldown policy is cross-cutting and future
contributors need the rationale and the escape hatch → **closing this plan ships
ADR 016** (package manager & supply-chain cooldown).

Related: no prior plan; touches every acceptance-gate command line documented
across `docs/plans/done/*` and `CLAUDE.md` (informational only — those are
historical records, not updated).

## Goals / Non-goals

- **Goals:**
  - Replace npm with pnpm across install, build, CI, Docker, and git hooks.
  - `pnpm-lock.yaml` committed; `package-lock.json` removed.
  - `minimumReleaseAge: 10080` (7 days) enforced on all dependency resolution.
  - Pin the toolchain: `packageManager` (Corepack), `engines.node`, `.nvmrc`.
  - Keep `better-sqlite3`'s native build working in the Docker multi-stage image.
  - The full validation gate (`typecheck && lint && test && build &&
    content:index:check`) passes under pnpm on the owner's Windows dev box, in
    CI, and inside the Docker build.
  - ADR 016 documenting the decision + the urgent-patch bypass.
- **Non-goals:**
  - No dependency **upgrades** in this plan — same versions, new manager. (A
    `pnpm install` of the existing pinned versions must produce the same tree;
    upgrades are a separate, later pass.)
  - No workspace/monorepo split — single package, `pnpm-workspace.yaml` is used
    only as the settings file.
  - None of the maintainability findings from the same review round (large-module
    split, budget-gate tests, constant de-duplication) — tracked separately.

## Phases

### Phase 1 — pnpm adoption + cooldown config (local)
- **Deliverables:**
  - **`pnpm-workspace.yaml`** (new) — the pnpm settings file. Keys:
    - `minimumReleaseAge: 10080` — 7 days in **minutes**. Bites only on version
      *resolution* (`pnpm add` / `pnpm update`); with a committed lockfile +
      `--frozen-lockfile`, CI/Docker installs are unaffected — exactly the right
      place for the friction.
    - `minimumReleaseAgeExclude: []` — the documented escape hatch, empty for now.
    - `allowBuilds: { better-sqlite3: true, esbuild: true }` — pnpm blocks
      dependency lifecycle/build scripts by default (a supply-chain default we
      *keep*). **Implementation note:** pnpm 11 **removed** the `onlyBuiltDependencies`
      array this plan originally named and replaced it with the `allowBuilds`
      package→boolean map; pnpm aborts the whole build phase if *any* script-having
      dep is unlisted, so `esbuild` (pulled in via `tsx`) must be enabled too, not
      just `better-sqlite3` (ADR 016).
    - `nodeLinker: hoisted` — flat `node_modules` like npm. Chosen so the
      Docker `COPY --from=builder /app/node_modules` and the `better-sqlite3`
      native `.node` artifact behave identically to today. (Revisit later if we
      want pnpm's stricter default linker; out of scope here.)
  - **`package.json`** — add `"packageManager": "pnpm@11.1.2"` (Corepack pin) and
    `"engines": { "node": ">=22 <23" }`.
  - **`.nvmrc`** (new) — `22`.
  - Delete **`package-lock.json`**; run `pnpm install` to generate
    **`pnpm-lock.yaml`**; commit it.
  - `.gitignore` / `.dockerignore` review — ensure `pnpm-lock.yaml` is **not**
    ignored and `package-lock.json` removal is clean.
- **Acceptance:**
  - `pnpm install` completes; `better-sqlite3` loads (`node -e "require('better-sqlite3')"`).
  - Full gate green locally: `pnpm run typecheck && pnpm run lint && pnpm test &&
    pnpm run build && pnpm run content:index:check`.
  - `pnpm-lock.yaml` present, `package-lock.json` gone, dep tree matches prior
    versions (no silent major bumps — spot-check `pnpm list --depth 0`).

### Phase 2 — Git hooks + script wording
- **Deliverables:**
  - `.husky/pre-commit` — `npx lint-staged` → `pnpm exec lint-staged`;
    `npm run --silent content:index` → `pnpm run --silent content:index`.
  - `.husky/pre-push` — the three `npm run` → `pnpm run`.
  - `scripts/build-content-index.ts:46` — the **runtime, user-facing** drift
    message ("run `npm run content:index`") → pnpm wording.
- **Acceptance:** editing a `content/*.md` file and committing regenerates the
  index via the hook under pnpm; `pnpm exec lint-staged` runs on staged TS.

### Phase 3 — CI (`deploy.yml`)
- **Deliverables:**
  - Add `pnpm/action-setup@v4` (reads the `packageManager` pin) **before**
    `actions/setup-node@v4`.
  - `actions/setup-node` `cache: npm` → `cache: pnpm`.
  - `npm ci` → `pnpm install --frozen-lockfile`; `npm run …` / `npm test` →
    `pnpm run …` / `pnpm test` (lines 24-30).
- **Acceptance:** the `check` job passes on a PR; cache restores keyed on
  `pnpm-lock.yaml`.

### Phase 4 — Docker
- **Deliverables:** `Dockerfile`
  - `COPY package.json package-lock.json ./` → `COPY package.json pnpm-lock.yaml
    pnpm-workspace.yaml ./`.
  - Enable pnpm in the image (`RUN corepack enable` — Corepack ships with
    `node:22-alpine`) so the `packageManager` pin resolves.
  - `RUN npm ci` → `RUN pnpm install --frozen-lockfile`.
  - `RUN npm run build` → `RUN pnpm run build`.
  - The prune line `rm -rf node_modules && npm ci --omit=dev --ignore-scripts &&
    npm rebuild better-sqlite3` → `pnpm install --prod --frozen-lockfile
    --ignore-scripts && pnpm rebuild better-sqlite3` (with `nodeLinker: hoisted`
    the resulting `node_modules` copies to the runtime stage exactly as today).
- **Acceptance:** `docker compose build` succeeds; the container starts, passes
  its heartbeat HEALTHCHECK, and `better-sqlite3` opens the DB (no missing
  native-binding error in logs).

### Phase 5 — Docs + ADR 016
- **Deliverables:**
  - `README.md` — install/dev/verify/Scripts blocks → pnpm.
  - `CLAUDE.md` — the `content:*` command references → pnpm; add a one-line
    "package manager is pnpm; cooldown enforced" note to the tooling section.
  - Script usage-comment headers (`build-content-index.ts`,
    `build-formula-review.ts`, `backfill-members.ts`) → pnpm.
  - `docs/architecture/architecture.md:44` → pnpm.
  - **`docs/adr/016-package-manager-and-cooldown.md`** (new) — decision: pnpm +
    `minimumReleaseAge` 7d; rationale; the **urgent-patch bypass** (temporarily
    add the package to `minimumReleaseAgeExclude`, or `pnpm add pkg@ver
    --config.minimumReleaseAge=0`, then revert); note lockfile+frozen installs
    are unaffected by the cooldown.
- **Acceptance:** a fresh clone following the README reaches a green gate using
  only pnpm; no functional `npm`/`npx` invocation remains in `package.json`
  scripts, hooks, CI, or Docker (historical `docs/plans/done/*` left as-is).

## Risks / Open questions

- **`better-sqlite3` native build under pnpm [high].** The main risk. Mitigated
  by `nodeLinker: hoisted` (flat layout ≈ npm) + `allowBuilds` + explicit `pnpm
  rebuild better-sqlite3` in the Docker prune step. **Status: verified on Windows
  locally** — the `.node` binding builds and `require('better-sqlite3')` round-
  trips; the full test suite passes. **The Docker image build is NOT yet verified**
  (no Docker on the dev box) — it must be exercised by the deploy job / droplet.
- **Corepack in `node:22-alpine` [low].** Corepack is bundled with Node 22;
  `corepack enable` should suffice. If the pinned pnpm version download is
  flaky in the build sandbox, fall back to `npm i -g pnpm@<ver>` in the image.
- **Cooldown friction on urgent security patches [low].** A genuine 0-day fix
  published <7 days ago won't resolve. Escape hatch documented in ADR 016
  (`minimumReleaseAgeExclude` / one-off `--config.minimumReleaseAge=0`). Since
  installs use the committed lockfile, this only affects the person running the
  upgrade, not CI/Docker.
- **Windows dev box [medium].** Owner develops on Windows 10. **Resolved:** store,
  hoisted linker, and `better-sqlite3` build all work under pnpm 11.1.2 on
  Windows; full gate green locally.
- **Exact pnpm version for the `packageManager` pin — resolved.** Pinned
  `pnpm@11.1.2` (the installed/Corepack version); no integrity hash (Corepack
  accepts the bare version and it isn't required for a private repo).

## Verification

End-to-end, after all phases:

1. `corepack enable` then `pnpm install` on a clean checkout (no
   `node_modules`) → lockfile-faithful install, `better-sqlite3` loads.
2. `pnpm run typecheck && pnpm run lint && pnpm test && pnpm run build && pnpm
   run content:index:check` → all green (Windows + CI).
3. `docker compose build && docker compose up -d` → container HEALTHY, logs show
   clean boot (migrations + content load), no native-binding error.
4. Stage a `content/*.md` edit + commit → pre-commit hook regenerates the index
   under pnpm; push → pre-push gate runs under pnpm.
5. Prove the cooldown: `pnpm add is-odd` (or any package with a <7-day-old
   latest) → pnpm resolves the newest version **older than 7 days**, not the
   freshest. Revert.

## Progress

- [x] Phase 1 — pnpm adoption + cooldown config (b7735da; README refresh 8793d29)
- [x] Phase 2 — git hooks + script wording (62f72fe)
- [x] Phase 3 — CI (746a8f6)
- [x] Phase 4 — Docker (6ab3f0f) — image build unverified (no local Docker)
- [x] Phase 5 — docs + ADR 016 (this commit)
