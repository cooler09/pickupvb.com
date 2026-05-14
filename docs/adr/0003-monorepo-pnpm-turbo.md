# 0003. pnpm workspaces + Turborepo monorepo

- **Status:** Accepted
- **Date:** 2025-08-12

## Context

The codebase splits cleanly into a Next.js app, a pure domain layer, an
application/CQRS layer, infrastructure adapters, shared types, and a
Supabase client wrapper. We need:

1. Strict module boundaries between layers (no `domain` → Next.js imports).
2. Fast incremental builds — typecheck/lint/build should be near-instant
   when only one package changed.
3. One `pnpm install` for the whole tree, no per-package node_modules.

## Decision

**pnpm workspaces** for dependency management; **Turborepo** for the build
graph.

- Workspace root declares packages in `pnpm-workspace.yaml`.
- Each layer is a separate package under `packages/*` with its own
  `tsconfig.json` extending `tsconfig.base.json`.
- Cross-package deps are declared in each `package.json` so TypeScript
  project references and the JS resolver agree.
- `turbo.json` defines the task graph: `build` depends on `^build`,
  `typecheck` is independent and parallel.
- Caching is local-only for now (no remote cache).

## Consequences

- ✅ pnpm enforces "you imported it, you depend on it" — no phantom deps.
- ✅ Turbo's cache means re-running `pnpm typecheck && pnpm lint && pnpm
  build` after a single-file change typically finishes in <5s.
- ✅ Boundaries are visible in `package.json` — easy to audit.
- ❌ Tooling overhead: every config file has a "is this per-package or
  workspace-root?" question. We've standardized on workspace-root for
  Prettier/ESLint base config, per-package for TypeScript and Vite.
- 🔒 We're committed to **not** using path aliases that cross packages
  outside their declared deps (no `@/` import reaching into another
  package). Use the package's published name.

## Alternatives considered

- **Single npm package** (no workspaces). Loses the boundary-enforcement
  win and would mean a much harder split later.
- **Nx instead of Turbo.** More features (code generators, dep graph
  visualization) at the cost of more buy-in. Turbo's simpler model wins for
  a project this size.
- **Yarn / npm workspaces.** pnpm's strict node_modules layout is the main
  reason boundaries actually hold; the others permit hoisting that lets
  phantom deps slip through.
