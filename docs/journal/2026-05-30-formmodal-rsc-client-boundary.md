# Fix: FormModal callers must be Client Components (2026-05-30)

## Context

Triaging **dev** runtime logs (`develop` → `dev.pickupvb.com` preview) surfaced
a single repeating error — 6 occurrences, one of them a hard **500** on
`GET /events/[id]/bracket`:

> `Functions cannot be passed directly to Client Components unless you
explicitly expose it by marking it with "use server".`
> `{trigger: function trigger, title, description, [size], children}`

[form-modal.tsx](../../apps/web/src/components/form-modal.tsx) is a `'use client'`
component whose `trigger` prop is a **render-prop function**
(`(open) => ReactNode`). All three of its call sites were **Server
Components**, so the function prop was being handed across the Server→Client
boundary, which RSC cannot serialize. `git log -S "'use client'"` confirms none
of the three ever carried the directive — so this was almost certainly tightened
from a tolerated warning into a hard error by the **Next 16 upgrade**, not a
local regression.

Critically, **`pnpm build` does not catch this** — it's a runtime RSC
serialization failure, invisible to typecheck/lint/build. It only showed up in
the deployed dev logs.

## Decisions

- **Lifted each call site to `'use client'`** rather than refactoring the
  `trigger` API or extracting a shared client wrapper. Chosen over the
  "extract a `WalkInTeamModalButton`" DRY refactor because (a) it's the minimal
  diff that fixes the bug, (b) AGENTS.md warns against refactoring beyond what's
  asked, and (c) these are host-only interactive tools — client-bundle cost for
  anonymous visitors is nil. The views' props are all serializable and their
  render logic is pure prop-based, so the lift is safe.
- **Left form-modal.tsx's public API untouched.** The `trigger`/`children`
  render-prop shape is correct; the bug was caller placement, not the
  primitive.

## Changes

- [no-bracket-view.tsx](../../apps/web/src/app/events/[id]/bracket/_components/no-bracket-view.tsx) — add `'use client'`.
- [setup-view.tsx](../../apps/web/src/app/events/[id]/bracket/_components/setup-view.tsx) — add `'use client'`.
- [host-ad-hoc-teams-panel.tsx](../../apps/web/src/app/events/[id]/_components/host-ad-hoc-teams-panel.tsx) — add `'use client'`.

All children (`WalkInTeamForm`, `FormatPickerForm`, `SeedingList`,
`SubmitButton`) were already `'use client'`; the bound server actions
(`.bind(null, …)`) and the one cross-boundary import
(`host-tools-section` → `type HostAdHocTeamRow`, erased at compile time) are
client-safe.

## Patterns observed

- **A function / render-prop passed from a Server Component to a Client
  Component throws at runtime and is invisible to the verify quad.** The only
  things that catch it are a runtime render or an e2e. When a `'use client'`
  primitive takes a function prop (callback, render-prop), **every caller must
  itself be a client component.** Candidate for promotion to AGENTS.md's
  "Patterns surfaced by audits" — deferred to the user's call.
- **The covering e2e existed but had never been run.**
  [bracket.authed.spec.ts](../../apps/web/tests/e2e/bracket.authed.spec.ts) drives
  `addWalkInTeam` (the failing walk-in modal) and `createAndGenerateBracket`
  (SetupView) — it would have gone red on this 500. Its own journal entry
  ([Phase 1 brackets](2026-05-30-bundle-e2e-phase1-brackets.md)) flagged "NOT
  verified here: a live run against dev." That unrun green run is exactly the
  gap that let this ship. Authoring an e2e is not the same as running it.

## Follow-ups

- **Run `bracket.authed.spec.ts` against dev** once this fix deploys — it both
  confirms the fix and clears the deferred green-run from the Phase 1 bundle.
- **Promote the function-prop-across-RSC-boundary gotcha to AGENTS.md** if the
  maintainer agrees it's durable (it's a general RSC rule, not bracket-specific).

## Verify

Standard quad green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
(test: 79 web + cached domain/application; lint warnings are all pre-existing
and in unrelated files). E2e not run here (no dev creds / mutating suite).
