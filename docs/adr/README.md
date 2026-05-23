# Architecture Decision Records

Short, dated records of significant architectural choices. New decisions go in
their own numbered file. **Existing ADRs are immutable** — if a decision
changes, add a new ADR that supersedes the old one and update the old one's
status to `Superseded by NNNN`.

| #                                          | Title                                                                         | Status   |
| ------------------------------------------ | ----------------------------------------------------------------------------- | -------- |
| [0001](0001-hexagonal-cqrs.md)             | Hexagonal architecture with CQRS-lite                                         | Accepted |
| [0002](0002-supabase-auth.md)              | Supabase Auth (not Clerk / Auth.js / Firebase)                                | Accepted |
| [0003](0003-monorepo-pnpm-turbo.md)        | pnpm workspaces + Turborepo monorepo                                          | Accepted |
| [0004](0004-typed-domain-errors.md)        | Typed `DomainError` hierarchy over string codes                               | Accepted |
| [0005](0005-page-decomposition.md)         | Page composition: `_components/` + co-located actions                         | Accepted |
| [0006](0006-event-divisions.md)            | Event divisions, tournament series, external registration                     | Accepted |
| [0007](0007-team-registration-model.md)    | Team registration model: ad-hoc vs. roster, division-aware, price-unit-driven | Accepted |
| [0008](0008-team-registration-paradigm.md) | Team registration paradigm: per-event single mode, ad-hoc default             | Accepted |
| [0009](0009-canonical-domain-apex.md)      | Canonical domain apex: `pickupvb.com`, no `www.`                              | Accepted |

## Template

```md
# NNNN. <Short title>

- **Status:** Proposed | Accepted | Superseded by NNNN | Deprecated
- **Date:** YYYY-MM-DD

## Context

What's the problem? What forces are at play?

## Decision

What did we decide?

## Consequences

What becomes easier? What becomes harder? What we're now committed to.

## Alternatives considered

What else we looked at and why we passed.
```
