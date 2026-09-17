# Architecture Decision Records

Short, dated records of significant architectural choices. New decisions go in
their own numbered file. **Existing ADRs are immutable** — if a decision
changes, add a new ADR that supersedes the old one and update the old one's
status to `Superseded by NNNN`.

| #                                                      | Title                                                                                | Status                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| [0001](0001-hexagonal-cqrs.md)                         | Hexagonal architecture with CQRS-lite                                                | Accepted                                                             |
| [0002](0002-supabase-auth.md)                          | Supabase Auth (not Clerk / Auth.js / Firebase)                                       | Accepted                                                             |
| [0003](0003-monorepo-pnpm-turbo.md)                    | pnpm workspaces + Turborepo monorepo                                                 | Accepted                                                             |
| [0004](0004-typed-domain-errors.md)                    | Typed `DomainError` hierarchy over string codes                                      | Accepted                                                             |
| [0005](0005-page-decomposition.md)                     | Page composition: `_components/` + co-located actions                                | Accepted                                                             |
| [0006](0006-event-divisions.md)                        | Event divisions, tournament series, external registration                            | Accepted                                                             |
| [0007](0007-team-registration-model.md)                | Team registration model: ad-hoc vs. roster, division-aware, price-unit-driven        | Amended by 0017 (walk-ins)                                           |
| [0008](0008-team-registration-paradigm.md)             | Team registration paradigm: per-event single mode, ad-hoc default                    | §2 superseded by 0016; amended by 0017                               |
| [0009](0009-canonical-domain-apex.md)                  | Canonical domain apex: `pickupvb.com`, no `www.`                                     | Accepted                                                             |
| [0010](0010-open-in-new-tab-server-actions.md)         | Open-in-new-tab pattern for Server Action redirects                                  | Accepted                                                             |
| [0011](0011-stripe-webhook-dedupe.md)                  | Stripe webhook idempotency via dedupe table                                          | Accepted                                                             |
| [0012](0012-registration-paradigm-invariants.md)       | Registration paradigm invariants (event type × team mode × composition × price unit) | Amended by 0016 (per-division); Bundle 121 (free-division exemption) |
| [0013](0013-team-identity-and-history.md)              | Team identity, persistence, and competitive history                                  | Proposed                                                             |
| [0016](0016-per-division-team-registration-mode.md)    | Per-division team registration mode (supersedes ADR 0008 §2)                         | Accepted                                                             |
| [0017](0017-walk-in-registrations.md)                  | Walk-in team registrations: source discriminator + nullable captain + cash payment   | Accepted; generalized by 0033                                        |
| [0018](0018-pool-play-configuration.md)                | Pool play configuration: bestOf, schedule mode, work team, courts                    | Proposed                                                             |
| [0019](0019-division-scoped-aggregate-entries.md)      | Division-scoped team & free-agent entries live inside the event aggregate            | Accepted                                                             |
| [0020](0020-user-profile-write-aggregate.md)           | `UserProfile` aggregate owns user-editable profile writes                            | Accepted                                                             |
| [0021](0021-group-aggregate-and-repository.md)         | `Group` aggregate + `GroupRepository` — draining the groups subdomain                | Accepted                                                             |
| [0022](0022-notification-outbox-port.md)               | `NotificationOutboxPort` — draining the notification subdomain                       | Accepted                                                             |
| [0023](0023-live-match-scoring.md)                     | Live match scoring — scoreboard ↔ scheduled match, Pro-gated                         | Proposed                                                             |
| [0024](0024-event-and-profile-media.md)                | Event & profile media — external videos, livestreams, and clips                      | Accepted                                                             |
| [0025](0025-standalone-brackets.md)                    | Standalone tournament brackets — owner-scoped, event-free                            | Accepted                                                             |
| [0026](0026-event-driven-notification-delivery.md)     | Event-driven notification delivery — DB kick + low-frequency sweep                   | Proposed                                                             |
| [0027](0027-realtime-broadcast-notifications.md)       | Realtime Broadcast for in-app notifications (the bell)                               | Accepted                                                             |
| [0028](0028-chat-messaging.md)                         | Chat / messaging — a unified conversation engine                                     | Accepted                                                             |
| [0029](0029-account-deletion.md)                       | Account deletion — soft-delete tombstone + grace-windowed hard purge                 | Accepted                                                             |
| [0030](0030-content-moderation-profanity.md)           | Content moderation — profanity filtering across community surfaces                   | Accepted                                                             |
| [0031](0031-gamification-badges.md)                    | Gamification — collector badges, achievements & Pro host event badges                | Accepted                                                             |
| [0033](0033-host-managed-account-less-team-entries.md) | Host-managed, account-less team entries across roster/league divisions               | Accepted                                                             |
| [0034](0034-league-play-on-entry-id.md)                | League play keys on `event_team_entries.id` (completes ADR 0033)                     | Accepted                                                             |
| [0035](0035-onboarding-checklists.md)                  | Onboarding checklists (player + host) — computed, no per-step badge                  | Accepted                                                             |
| [0037](0037-season-passes.md)                          | Season passes — Pro-host prepaid multi-session credit packs (monetization O-1)       | Accepted                                                             |
| [0038](0038-group-payouts-club-tier.md)                | Group payouts + Club tier — pooled payouts for clubs (monetization O-2)              | Accepted                                                             |
| [0039](0039-referrals-pro-grants.md)                   | Host referrals + comped Pro grants (monetization O-3)                                | Accepted                                                             |
| [0040](0040-pool-play-total-games-ties.md)             | Pool play "total games" scoring — play N, both count, ties allowed                   | Accepted                                                             |
| [0041](0041-public-polls.md)                           | Public polls — sessionless multi-question responses via short link                   | Accepted                                                             |

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
