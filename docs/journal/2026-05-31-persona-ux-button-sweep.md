# Persona UX bundle 4: CC-1 button sweep + ratchet (2026-05-31d)

## Context

Fourth bundle off [docs/audits/persona-ux.md](../audits/persona-ux.md), closing
**CC-1**: the 59 remaining hand-rolled `bg-primary hover:bg-primary/90 … text-white`
primary buttons across 47 files (everything the bundle-1 quick wins didn't already
hit). Same migrate-then-ratchet shape as the CC-2 field convergence (bundles
2026-05-31b/c) and m3-alignment.md's shape-scale lock.

## Decisions

- **Exact-string codemod, not fuzzy regex.** The 59 occurrences deduped to ~30
  distinct class strings, all variations on two families (`px-4 py-2` = `md`,
  `px-3 py-1.5` = `sm`). Wrote `/tmp/cc1-codemod.mjs` with an explicit
  `{exactString → (size, layoutExtras)}` map and replaced only exact matches —
  no chance of mangling an unrelated class list. Layout-only extras (`w-full`,
  `shrink-0`, `text-center`, `shadow-lg`, `gap-2`, `ml-auto`) are preserved by
  emitting `` `${primaryButtonClass('md')} w-full` ``; emphasis/weight/size
  differences (`font-medium` vs `semibold`, `text-xs` vs `text-sm`, `py-2.5`) are
  intentionally **normalized away** by the canonical class — that normalization is
  the point.
- **Quote-style aware replacement.** `className="STR"` → `className={primaryButtonClass(...)}`
  (double-quote → wrap in braces); a single-quoted `'STR'` in an expression
  context (const / ternary, e.g. the sticky-CTA string) → bare
  `primaryButtonClass(...)`. Kept JSX valid in both positions.
- **Two manual fixes the codemod couldn't do safely.**
  (1) `event-filter-form.tsx`'s first import is multi-line (`import {\n …\n} from
…`); the "insert after the first `import` line" heuristic split it — moved the
  inserted import below the complete statement. (This was the only multi-line
  first import among the 47; typecheck caught it immediately.)
  (2) `community/page.tsx`'s "Apply" filter button is height-matched to its
  adjacent compact selects (`h-[34px]`, no `py`) — not in the map; set it to
  `` `${primaryButtonClass('sm')} h-[34px]` `` by hand to keep the alignment.
- **Ratchet has no exceptions.** Unlike CC-2 (which had 2 compact-inline field
  exceptions), the button sweep hit **zero** remaining `hover:bg-primary/90`, so
  the two new `no-restricted-syntax` selectors (`Literal` + `TemplateElement`
  matching `hover:bg-primary/90`) are exception-free. `hover:bg-primary/90` is a
  clean fingerprint — the canonical filled button uses the `state-layer` overlay,
  never that hover class.
- **Scope held to the filled-primary recipe.** The neutral outlined secondaries
  (`border-border-base hover:bg-fg/5`) are a separate, fuzzier set and are _not_
  caught by this ratchet; deferred to a P3 `secondaryButtonClass` convergence so
  this bundle stays a clean, verifiable diff.

## Changes

- 47 files migrated to `primaryButtonClass('sm'|'md')` (+ preserved layout
  extras) — form submits, error pages, marketing/nav (`site-header` sign-up pill,
  `mobile-menu`, `pricing`, `community`, `profile/billing/pro`, `leaving`), event
  panels (`event-hero`, `tip-jar`, `event-sticky-cta`, RSVP/team/broadcast
  panels), and misc (`report-bug-button`, `push-subscribe-button`,
  `datetime-picker`, `handle-editor`, `invite-response`, …).
- `apps/web/eslint.config.mjs` — two `no-restricted-syntax` selectors forbidding
  `hover:bg-primary/90` (the CC-1 ratchet), next to the CC-2 + M3 ratchets.
- Metrics: `primaryButtonClass` adoption 11 → **61 files**; `hover:bg-primary/90`
  68 → **0**; `text-white` on primary buttons 64 → **3** (CC-3 largely absorbed,
  since `primaryButtonClass` emits the `text-primary-fg` token).

Verify chain green: typecheck, lint (0 errors; 3 pre-existing warnings), 621
tests, build. Ratchet verified to pass the clean tree and fire on a probe.

## Patterns observed

- **Exact-match codemod + immediate typecheck is a safe way to do a 47-file
  mechanical sweep.** The one breakage (multi-line import split) surfaced as a
  `tsc` syntax error in seconds, not a silent runtime bug. A fuzzy regex would
  have risked mangling class lists invisibly.
- **The codemod's weakest point is import insertion, not text replacement.**
  "Insert after the first `import` line" breaks on multi-line first imports. If
  this codemod pattern recurs, insert after the _last_ top-level import (or before
  the first non-import statement) instead.

## Follow-ups

- **Secondary/outlined-button convergence (P3).** `border-border-base
hover:bg-fg/5` → `secondaryButtonClass`. Fuzzier (more layout variance); not
  ratchet-covered yet.
- Remaining persona-ux P2: login-page _field_ primitives (its inputs still bypass
  `TextField`; submit is now canonical), shared `GuestSignupFields`, host form
  depth + divisions-manager FormModal (CC-5/H-2).
- Re-confirm the 3 residual `text-white`-on-`bg-primary` spots are non-button
  (badge/pill) contexts when CC-3 is formally closed.
