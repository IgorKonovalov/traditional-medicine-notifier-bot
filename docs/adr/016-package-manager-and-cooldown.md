# ADR 016 — Package manager: pnpm with a supply-chain release-age cooldown

**Date:** 2026-07-01
**Status:** Accepted

## Context

The project used npm (`package-lock.json`, `npm ci` in CI and the Docker build,
`npm run` in the husky hooks). Two things prompted a change:

1. **Supply-chain risk.** The npm registry sees a steady stream of malicious
   releases — typosquats, compromised-maintainer publishes, post-install script
   attacks. The overwhelming majority are detected and yanked within hours. A
   project that resolves dependency versions the instant they publish is exposed
   to exactly this smash-and-grab window; a project that waits a few days almost
   never sees a malicious version at all.
2. **Reproducibility / ergonomics.** No `packageManager` pin, no `engines`, no
   `.nvmrc` — the toolchain version was implicit. pnpm's content-addressed store
   is faster and its non-flat `node_modules` prevents phantom-dependency drift.

pnpm ships a native control for (1): **`minimumReleaseAge`** (added v10.16, a
default in v11) refuses to *resolve* a dependency version until it has been
published for a configured number of minutes.

## Decision

**Adopt pnpm 11 as the sole package manager, pinned via Corepack, and enforce a
7-day dependency release-age cooldown.**

- **Pin:** `"packageManager": "pnpm@11.1.2"` in `package.json` (Corepack
  provisions it); `"engines": { "node": ">=22 <23" }` and `.nvmrc` (`22`) pin the
  runtime. `package-lock.json` is deleted; `pnpm-lock.yaml` is committed.
- **Settings live in `pnpm-workspace.yaml`** (pnpm 11's settings file; the repo
  is a single package, so it carries no `packages:` list):
  - `minimumReleaseAge: 10080` — **7 days in minutes.** No version published less
    than 7 days ago will be resolved.
  - `minimumReleaseAgeExclude: []` — the escape-hatch list (empty by default).
  - `allowBuilds: { better-sqlite3: true, esbuild: true }` — pnpm 11 blocks
    dependency install/build scripts by default (`strictDepBuilds`, a
    supply-chain default we **keep**) and **replaced the removed
    `onlyBuiltDependencies` array with this package→boolean map**. Only the two
    deps that legitimately need a build script are enabled: `better-sqlite3`
    (native SQLite binding) and `esbuild` (places its own prebuilt binary, pulled
    in via `tsx`). pnpm aborts the whole build phase if *any* script-having dep
    is unlisted, so both must appear.
  - `nodeLinker: hoisted` — a flat `node_modules` like npm's, so the Docker
    `COPY --from=builder /app/node_modules` and the native `better-sqlite3`
    artifact behave exactly as before. (We can revisit pnpm's stricter default
    linker later; not now.)
- **The cooldown bites only on *resolution*** — `pnpm add` / `pnpm update`, i.e.
  a human pulling in or bumping a dependency. Installs from the committed lockfile
  (`pnpm install --frozen-lockfile`, used in CI and Docker) do **not** re-resolve,
  so the cooldown never delays or breaks a deploy.

## Consequences

- A newly published (or freshly bumped) dependency version cannot be installed
  until it is 7 days old. This is the point — it trades a few days of "latest" for
  immunity to the smash-and-grab attack window.
- **Urgent-patch bypass** (when a genuinely needed fix is younger than 7 days),
  in order of preference:
  1. Add the package to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`,
     install, then revert once it ages past the window; **or**
  2. a one-off `pnpm add <pkg>@<ver> --config.minimumReleaseAge=0`.
  Either way the committed lockfile + frozen installs mean CI/Docker are
  unaffected — only the person doing the upgrade waits.
- **Adding a dependency with a build script requires a conscious edit** to
  `allowBuilds` (default-deny). This is friction we accept: an unexpected
  install-script request is exactly the signal worth reviewing.
- Every npm touchpoint moved to pnpm: CI (`pnpm/action-setup@v4` +
  `cache: pnpm` + `pnpm install --frozen-lockfile`), the Docker multi-stage build
  (`corepack enable`, `pnpm install`/`rebuild`), and the husky hooks
  (`pnpm exec` / `pnpm run`).
- Contributors must have Corepack enabled (bundled with Node 22); a bare `npm
  install` would ignore the lockfile and the cooldown.

## Alternatives considered

- **Stay on npm + a third-party cooldown tool** (e.g. a `.npmrc`
  `before=`-style pin or an external checker) — rejected: npm has no first-class
  release-age setting; bolt-ons are fragile and unenforced in CI.
- **pnpm with the default `minimumReleaseAge` (1 day, pnpm 11)** — rejected in
  favour of 7 days: the owner wanted a wider margin, and a week still comfortably
  clears the detect-and-yank window for the incidents this defends against.
- **yarn / bun** — not evaluated in depth; pnpm's native `minimumReleaseAge` +
  strict linker + Corepack pinning already covered the goals, and pnpm is the
  closest ergonomic match to the existing npm workflow.
- **Keep running dependency build scripts unrestricted** — rejected: pnpm 11's
  default-deny (`allowBuilds`) is a cheap, high-value supply-chain guard; the
  allowlist is two lines.

## References

- Plan 027 — Migrate to pnpm + supply-chain release-age cooldown.
- ADR 001 (tech stack), ADR 003 (portability discipline — `nodeLinker: hoisted`
  keeps the Docker copy identical).
- pnpm docs: Settings (`minimumReleaseAge`, `allowBuilds`), Supply-chain
  security; pnpm 11.0 release notes (removal of `onlyBuiltDependencies`).
