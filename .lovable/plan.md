## Goal
Make Cloudflare Pages' `bun install --frozen-lockfile` step succeed for this project.

## Root cause
The repo ships two lockfiles:

- `bun.lock` (in sync with `package.json` — verified locally with `bun install --frozen-lockfile`: "no changes")
- `package-lock.json` (legacy, left over from the old gh-pages workflow)

Cloudflare detects Bun (because `bun.lock` exists) and runs `bun install --frozen-lockfile`. That part is actually fine on its own. The deploy still fails because:

1. `package.json` also contains gh-pages scripts (`predeploy`, `deploy`, `homepage` field) that reference an npm-only flow, and the stale `package-lock.json` drifts every time a dep is added via Bun. Any tooling that falls back to npm will fail frozen-install.
2. There is no `packageManager` field pinning Bun, so Cloudflare's auto-detect can flip between npm and bun depending on which lockfile it sees first.

## Changes

1. **Delete `package-lock.json`** — single source of truth becomes `bun.lock`.
2. **Pin Bun in `package.json`** by adding `"packageManager": "bun@1.3.3"` so Cloudflare always uses Bun and matches the lockfile format we generate.
3. **Remove gh-pages residue from `package.json`** that no longer applies to a Cloudflare deploy:
   - drop `"homepage"` field (points at a GitHub Pages URL)
   - drop `"predeploy"` and `"deploy"` scripts
   - drop the `gh-pages` devDependency
   This also keeps `bun.lock` from re-drifting on the next install.
4. **Re-run `bun install`** locally to regenerate `bun.lock` without `gh-pages`, then verify with `bun install --frozen-lockfile` that it reports "no changes".

## Out of scope
- No application/runtime code changes.
- No Cloudflare config files added — the existing `@cloudflare/vite-plugin` setup already handles the build.
- The pre-existing hydration warning in the runtime errors panel is unrelated and not addressed here.