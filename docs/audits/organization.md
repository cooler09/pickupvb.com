# Developer / project organization audit — 2026-05-17

> **Status (2026-05-17):** Quick-win bundle landed. P1 #3 (editor/VS Code config) ✅, P2 (PR template, Dependabot, `.gitattributes`) ✅. P1 #1 (lint coverage) and #2 (test scripts) deferred — they require non-trivial decisions (shared ESLint config; test framework choice). See **Remediation log** and **Still open** below.

> **Status update (2026-05-22):** No organization shipments this pass. Two
> notes: (1) the `apps/web` `dev` / `build` `--webpack` flag (P2 open
> question) is now likely tied to staying on `next@14.2.35` — see the
> [security audit](security.md) P1 #0. Bumping to Next 15.5.16+ should let
> Turbopack come back. (2) Test scripts P1 status: 5 `*.test.ts` files in
> `packages/` and 4 in `apps/` exist (plus an `apps/web/tests/e2e/`
> skeleton); root `pnpm test` still routes through the no-op scripts in
> the unconfigured packages, so CI remains green-by-accident as documented.

## Scope

Organizational and operational layer of the pickupvb.com monorepo: workspace + Turborepo configuration, TypeScript setup, lint/format tooling, CI/CD, git hygiene, editor config, dependency hygiene, folder conventions, dev scripts, migration tooling, and onboarding ergonomics. Application-level findings (code quality, architecture, security, etc.) live in the sibling audits — this report only covers things that affect how the project is _operated_. Skipped `copilot-skills`.

---

## Layout snapshot

| Concern               | File                                                  | Status                                                                |
| --------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| Workspace             | `pnpm-workspace.yaml`                                 | ✅ globs `apps/*` and `packages/*`                                    |
| Turbo pipeline        | `turbo.json`                                          | ✅ build / lint / typecheck / test / dev wired                        |
| TS base               | `tsconfig.base.json`                                  | ✅ `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` |
| TS per-package        | `packages/*/tsconfig.json`                            | ✅ extends base; no project refs / composite                          |
| Lint                  | `apps/web/eslint.config.mjs` only                     | ⚠️ packages have no-op `lint` scripts                                 |
| Format                | `.prettierrc.json` + `prettier-plugin-tailwindcss`    | ✅                                                                    |
| Lockfile              | `pnpm-lock.yaml`                                      | ✅ committed; CI uses `--frozen-lockfile`                             |
| Node pin              | `.nvmrc`                                              | ✅ matches `engines.node`                                             |
| CI                    | `.github/workflows/ci.yml`, `supabase-migrations.yml` | ✅ split correctly                                                    |
| Pre-commit hooks      | —                                                     | ❌ none (no husky / lint-staged)                                      |
| `.editorconfig`       | ✅ added 2026-05-17                                   |
| `.gitattributes`      | ✅ added 2026-05-17                                   |
| `.vscode/`            | ✅ added 2026-05-17 (extensions + settings)           |
| PR template           | ✅ added 2026-05-17                                   |
| Issue templates       | ❌ missing                                            |
| CODEOWNERS            | ❌ missing (deferred — solo project)                  |
| Dependabot / Renovate | ✅ Dependabot added 2026-05-17                        |

---

## P1 findings

### Lint coverage limited to `apps/web` — six packages run no-op lint scripts

- **Where:** `packages/{domain, application, infrastructure, supabase, notifications, types}/package.json` — each declares `"lint": "echo 'lint: no rules yet' && exit 0"` (or equivalent).
- **Issue:** Root `pnpm lint` and CI's `pnpm lint` only actually lint the web app. Domain, application, and infrastructure — the layers that the architecture audit identified as P1-quality-critical — go entirely unchecked. Unused imports, naming violations, and `no-floating-promises` issues land silently. Worse, the no-op gives a _false_ signal of clean lint.
- **Fix:** Pick a strategy: (a) create a shared `@pickupvb/eslint-config` and have each package extend it, or (b) put a root-level ESLint flat config that globs the whole monorepo. Either way, replace the placeholder scripts with `eslint .`. For domain/application especially, enable `@typescript-eslint/no-floating-promises`, `no-unused-vars`, `no-explicit-any`.

### Test scripts are no-ops; CI is green by accident

- **Where:** All 7 `package.json` files — `"test": "echo 'no tests (yet)' && exit 0"`.
- **Issue:** CI runs `pnpm test` and always passes regardless of code health. The architecture audit found zero tests anywhere; here it surfaces as the _tooling_ problem that makes the absence invisible. New code can break business logic and CI will never know.
- **Fix:** Cross-reference architecture audit P1. As soon as a test framework is chosen (Vitest recommended), replace the placeholder scripts. Until then, leave the no-op but add a CI annotation reminding reviewers `tests are not enforced`.

### No editor / VS Code config committed ✅ (2026-05-17)

- **Where:** Root (missing `.editorconfig`); `.vscode/` directory absent.
- **Issue:** No shared format-on-save, no recommended extensions list (ESLint, Prettier, Tailwind IntelliSense, Supabase), no debug launch configs for Next.js. Cross-platform contributors will land mixed line endings; new contributors lose time wiring editors that already match the codebase.
- **Fix:** Add `.editorconfig` (LF, 2-space indent, trim trailing whitespace, insert final newline). Add `.vscode/extensions.json` recommending the relevant extensions and `.vscode/settings.json` with `editor.formatOnSave: true`, the Prettier default formatter, and `eslint.workingDirectories` for the monorepo. Optionally a `launch.json` for Next debugging.

---

## P2 findings

### No pre-commit hooks (husky + lint-staged)

- **Where:** Root `package.json` lacks `husky` / `lint-staged`; no `.husky/` directory.
- **Issue:** Developers can commit code that fails `pnpm typecheck` / `pnpm lint` / `pnpm build`. The verification triple lives in AGENTS.md but isn't enforced locally — it gets caught only by CI, with longer feedback loop. Combined with the lint coverage gap (P1) this means broken-but-unlinted packages can land repeatedly.
- **Fix:** `pnpm add -D husky lint-staged` at root; add `.husky/pre-commit` running `pnpm exec lint-staged`; configure lint-staged to run ESLint on `*.{ts,tsx}` and Prettier on the broader pattern. Optionally a `pre-push` running `pnpm typecheck`.

### No PR template, issue templates, or CODEOWNERS 🟡 Partial (2026-05-17)

- **Where:** `.github/` (missing PR template, ISSUE_TEMPLATE/, CODEOWNERS).
- **Issue:** PRs lack a structured checklist (typecheck / lint / build run? migration included? doc updated? ADR needed?). Issues land without category labels. CODEOWNERS auto-routing absent — fine for a solo project but limiting if a contributor lands.
- **Fix:** Add `.github/PULL_REQUEST_TEMPLATE.md` with a verification checklist mirroring the AGENTS.md triple. Add `bug.md` / `feature.md` issue templates if user-facing reporting is desired. Defer CODEOWNERS until there's a real owner map.

### No Dependabot / Renovate ✅ (2026-05-17)

- **Where:** `.github/dependabot.yml` / `renovate.json` (missing).
- **Issue:** Dependencies (Next.js, React, Stripe SDK, Supabase clients, web-push, Leaflet) will only update on manual sweeps. Security fixes (the Resend, Stripe, and `@supabase/ssr` chains all release frequently) require explicit attention.
- **Fix:** Add `.github/dependabot.yml` with weekly npm updates grouped sensibly (e.g., one PR for all `@supabase/*`, one for all `@types/*`). Or use Renovate for finer control.

### No `.gitattributes` ✅ (2026-05-17)

- **Where:** Root.
- **Issue:** No enforcement of LF line endings or binary detection for lockfile. Windows clones risk CRLF noise in diffs.
- **Fix:** Add `.gitattributes` with `* text=auto eol=lf` and explicit entries for `*.ts`, `*.tsx`, `*.json`, `*.md`, `pnpm-lock.yaml`.

### `@pickupvb/config` package name is misleading

- **Where:** [packages/config/](packages/config/).
- **Issue:** Only exports `tsconfig` presets. Future contributor will reasonably expect ESLint/Prettier/Tailwind configs here and not find them. As lint coverage expands (P1), this is the natural home.
- **Fix:** Either rename to `@pickupvb/tsconfig`, or expand it into the home for shared ESLint + Prettier + Tailwind presets and keep the name.

### Inconsistent dependency pinning

- **Where:** `@types/node` is `^25.8.0` in some packages, `25` in others; `typescript` is `^6.0.3` everywhere but root scripts handle the resolver inconsistently.
- **Issue:** Bare version (`25`) vs. caret (`^25.8.0`) yield different update behavior and confuse readers about intent.
- **Fix:** Pick one (caret for dev deps, exact only where reproducibility matters) and apply uniformly. Document in AGENTS.md.

### `apps/web/package.json` `dev` and `build` force `--webpack`

- **Where:** [apps/web/package.json](apps/web/package.json) (~L8–L9).
- **Issue:** Next 16's default is Turbopack — explicitly opting back to Webpack slows local dev and may be a leftover from a debugging session. No code comment explains why.
- **Fix:** Either drop `--webpack` (preferred — Turbopack is the default for a reason in Next 16) or add a comment explaining the specific incompatibility forcing it.

### No remote Turbo cache configured

- **Where:** `turbo.json`.
- **Issue:** Every CI run rebuilds from scratch; the Vercel free remote cache would meaningfully cut PR feedback time.
- **Fix:** Configure remote cache via Vercel; add the team/teamId/signature config to `turbo.json` (signature mode requires a CI secret).

---

## P3 findings

### TypeScript packages don't use `composite` / project references

- **Where:** `packages/*/tsconfig.json`.
- **Issue:** Incremental builds would be slightly faster with `composite: true` + cross-package `references`. Marginal at current scale.
- **Fix:** Revisit if build times become painful.

### Node pinned to 20.11.0 while TypeScript is 6.x

- **Where:** [.nvmrc](.nvmrc), `engines.node`.
- **Issue:** Node 20 LTS is fine but ages out; Node 22 is the current LTS. No urgent reason to bump.
- **Fix:** Bump to Node 22 LTS at the next dependency sweep.

### CI uses hardcoded Supabase placeholder keys

- **Where:** [.github/workflows/ci.yml](.github/workflows/ci.yml) (~L46–L48).
- **Issue:** Build step injects obvious placeholder values to satisfy Next's runtime checks. Works fine; just signals an incomplete CI env story (no actual smoke against a real Supabase).
- **Fix:** Either leave as-is (cheap and clear) or wire a real CI Supabase via the GitHub Action.

### No `CHANGELOG`, no `changesets`

- **Where:** Repo root.
- **Issue:** Already flagged in documentation audit. Organizational angle: no release versioning tooling. Fine for a continuously-deployed app.
- **Fix:** Skip unless a release cadence appears.

---

## Verified good

- **`pnpm-workspace.yaml`** correctly globs `apps/*` + `packages/*`; no orphan directories.
- **Turbo pipeline** declares all standard tasks with sensible inputs/outputs; cache mostly works.
- **All packages named `@pickupvb/*`** consistently; all private; all at `0.1.0` (unversioned monorepo, appropriate).
- **`tsconfig.base.json`** turns on `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`. Strong baseline.
- **File-naming conventions** consistent: kebab-case `.tsx` (`address-autocomplete.tsx`, `mobile-menu.tsx`), `_components/` co-location applied across routes, action files named `*-actions.ts`.
- **`.gitignore`** covers `node_modules`, `.next`, `dist`, `.turbo`, `.env*`, `.vercel`, `.DS_Store`, coverage, logs. Confirmed `.env` not tracked (security audit verified).
- **Lockfile committed and CI enforces `--frozen-lockfile`.**
- **Migration naming** uses consistent ISO timestamp prefix; no orphans or test migrations in the tree.
- **CI splits concerns:** `ci.yml` for app build/lint/typecheck/test; `supabase-migrations.yml` for schema apply on push.
- **README + AGENTS document the verification triple** (`pnpm typecheck && pnpm lint && pnpm build`).
- **`prettier-plugin-tailwindcss`** wired so class ordering is canonical.
- **No deep cross-package imports** (verified in architecture audit) — module boundaries respected.
- **Dependency structure** clean: root has tooling/dev deps; packages declare workspace refs; no circulars.

---

## Quick-win bundle

1. **Add `.editorconfig` + `.gitattributes`** (~10 min) — instant cross-platform consistency.
2. **Add `.vscode/{extensions,settings}.json`** (~20 min) — one-shot onboarding for new contributors.
3. **Add `.github/PULL_REQUEST_TEMPLATE.md`** mirroring the AGENTS verification triple (~10 min).
4. **Add `.github/dependabot.yml`** with weekly grouped npm updates (~10 min).
5. **Install husky + lint-staged** (~20 min) — local enforcement of typecheck/lint before commit. This becomes meaningful once the lint-coverage gap (P1) is closed.

---

## Open questions

- **Why `--webpack` on dev/build?** Known Turbopack issue, or vestige? Worth removing if it can be.
- **Where should the shared ESLint config live?** Inside the existing `@pickupvb/config` (after rename / expand), or a new `@pickupvb/eslint-config`?
- **Vercel remote Turbo cache** — is the project already on a Vercel team that exposes this? Free perf win if yes.
- **Test framework choice** — Vitest (architecture audit's recommendation) or Jest? Settling this unblocks both the test-script P1 here and the testing-strategy doc in the documentation audit.
- **CI Supabase smoke** — is the placeholder-keys-only approach intentional (fast CI) or would a real CI Supabase be useful?

---

## Remediation log

| Date       | Finding                                   | Change                                                                                                                                                                                                                       | Files                                                                                                                                                |
| ---------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-17 | No editor / VS Code config committed (P1) | Added EditorConfig matching actual code style (4-space TS/TSX, 2-space JSON/YAML/MD) plus VS Code recommended extensions and workspace settings (format-on-save, ESLint working dirs, Tailwind classRegex, search excludes). | [.editorconfig](../../.editorconfig), [.vscode/extensions.json](../../.vscode/extensions.json), [.vscode/settings.json](../../.vscode/settings.json) |
| 2026-05-17 | No `.gitattributes` (P2)                  | Added attributes file forcing LF line endings, marking `pnpm-lock.yaml` and generated Supabase types as `linguist-generated`, and tagging binary file extensions.                                                            | [.gitattributes](../../.gitattributes)                                                                                                               |
| 2026-05-17 | No PR template (P2 partial)               | Added pull-request template covering summary/changes, the verification triple checklist, DB-touch / domain-test / ADR prompts, and screenshots. Issue templates and CODEOWNERS still deferred.                               | [.github/PULL_REQUEST_TEMPLATE.md](../../.github/PULL_REQUEST_TEMPLATE.md)                                                                           |
| 2026-05-17 | No Dependabot / Renovate (P2)             | Added Dependabot config: weekly npm updates grouped by surface area (supabase, stripe, next, react, types, eslint, prettier) plus weekly github-actions updates.                                                             | [.github/dependabot.yml](../../.github/dependabot.yml)                                                                                               |

## Still open

- **P1** Lint coverage limited to `apps/web` — six packages still unlinted. Needs shared ESLint config decision (see open question).
- **P1** Test scripts are no-ops in most packages — cross-listed with architecture audit; pending test framework choice.
- **P2** No pre-commit hooks (husky + lint-staged) — value depends on closing the lint-coverage gap first.
- **P2** Issue templates + CODEOWNERS — only PR template shipped.
- **P2** `@pickupvb/config` misleading name.
- **P2** Inconsistent dependency pinning across packages.
- **P2** `apps/web` `--webpack` flag — investigate / remove if obsolete.
- **P2** No remote Turbo cache.
- All **P3** items.
- All **Open questions** above.
