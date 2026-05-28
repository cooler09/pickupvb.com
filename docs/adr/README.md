# Architecture Decision Records

Short, dated records of significant architectural choices. New decisions go in
their own numbered file. **Existing ADRs are immutable** — if a decision
changes, add a new ADR that supersedes the old one and update the old one's
status to `Superseded by NNNN`.

| #                                                   | Title                                                                                | Status                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| [0001](0001-hexagonal-cqrs.md)                      | Hexagonal architecture with CQRS-lite                                                | Accepted                                                             |
| [0002](0002-supabase-auth.md)                       | Supabase Auth (not Clerk / Auth.js / Firebase)                                       | Accepted                                                             |
| [0003](0003-monorepo-pnpm-turbo.md)                 | pnpm workspaces + Turborepo monorepo                                                 | Accepted                                                             |
| [0004](0004-typed-domain-errors.md)                 | Typed `DomainError` hierarchy over string codes                                      | Accepted                                                             |
| [0005](0005-page-decomposition.md)                  | Page composition: `_components/` + co-located actions                                | Accepted                                                             |
| [0006](0006-event-divisions.md)                     | Event divisions, tournament series, external registration                            | Accepted                                                             |
| [0007](0007-team-registration-model.md)             | Team registration model: ad-hoc vs. roster, division-aware, price-unit-driven        | Amended by 0017 (walk-ins)                                           |
| [0008](0008-team-registration-paradigm.md)          | Team registration paradigm: per-event single mode, ad-hoc default                    | §2 superseded by 0016; amended by 0017                               |
| [0009](0009-canonical-domain-apex.md)               | Canonical domain apex: `pickupvb.com`, no `www.`                                     | Accepted                                                             |
| [0010](0010-open-in-new-tab-server-actions.md)      | Open-in-new-tab pattern for Server Action redirects                                  | Accepted                                                             |
| [0011](0011-stripe-webhook-dedupe.md)               | Stripe webhook idempotency via dedupe table                                          | Accepted                                                             |
| [0012](0012-registration-paradigm-invariants.md)    | Registration paradigm invariants (event type × team mode × composition × price unit) | Amended by 0016 (per-division); Bundle 121 (free-division exemption) |
| [0013](0013-team-identity-and-history.md)           | Team identity, persistence, and competitive history                                  | Proposed                                                             |
| [0016](0016-per-division-team-registration-mode.md) | Per-division team registration mode (supersedes ADR 0008 §2)                         | Accepted                                                             |
| [0017](0017-walk-in-registrations.md)               | Walk-in team registrations: source discriminator + nullable captain + cash payment   | Accepted                                                             |
| [0018](0018-pool-play-configuration.md)             | Pool play configuration: bestOf, schedule mode, work team, courts                    | Proposed                                                             |

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
