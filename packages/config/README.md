# @pickupvb/config

Shared **build-tooling presets** for the monorepo. Today this means one
thing: the flat **ESLint base config** every library package extends.

> Agents: read [AGENTS.md](../../AGENTS.md) at the repo root first.

## What's here

| Export            | Source                                     | Purpose                                                                                                                                     |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `./eslint/base`   | [eslint.base.mjs](eslint.base.mjs)         | Flat ESLint config: `@eslint/js` recommended + `typescript-eslint` recommended + `no-unused-vars` / `no-explicit-any` / `no-console` warns. |
| `./tsconfig/base` | _planned_ — `tsconfig/base.json` (missing) | Aspirational. The `exports` map references these paths but the files don't exist yet; packages currently inline their tsconfig settings.    |
| `./tsconfig/next` | _planned_ — `tsconfig/next.json` (missing) | Same.                                                                                                                                       |
| `./tsconfig/node` | _planned_ — `tsconfig/node.json` (missing) | Same.                                                                                                                                       |

The unused `./tsconfig/*` entries in [package.json](package.json) are
remnants from the original audit (organization audit P2: misleading package
name). They'll either be deleted or backfilled with real preset files in a
future bundle.

## Using the ESLint base

Each library package has a one-line `eslint.config.mjs`:

```js
export { default } from '@pickupvb/config/eslint/base';
```

Per-package overrides go in the same file alongside the base import.
`apps/web` does **not** extend this base directly — it ships its own
Next-aware config because the base doesn't pull in `next/core-web-vitals`
rules.

## Adding a shared preset

Prefer expanding this package over creating a new one. New presets
(Prettier, Tailwind, etc.) belong here so contributors have a single
place to look.
