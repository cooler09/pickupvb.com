# docs/ — map

Entry point for the `docs/` tree. The repo's two primary instruction files live
at the root: [AGENTS.md](../AGENTS.md) (conventions + gotchas for agents) and
[README.md](../README.md) (human setup). This file maps everything under `docs/`.

The tree has four kinds of doc. **Reference** docs describe how things work now
and are kept current. **Decision** records (`adr/`) and the **journal** are
append-only history — the "why" and the journey. **Audits** are point-in-time
snapshots with a remediation backlog.

## Reference docs (kept current)

**Contributor / setup**

- [onboarding.md](onboarding.md) — contributor day-1: `git clone` → first PR.
- [setup-dev-environment.md](setup-dev-environment.md) — standing up `dev.pickupvb.com`.
- [environments.md](environments.md) — the prod vs. dev cloud environments.
- [testing.md](testing.md) — testing strategy across the three test surfaces.
- [e2e-test-plan.md](e2e-test-plan.md) — manual test guide for every critical flow.

**Operations / runbooks**

- [runbook.md](runbook.md) — deploy, rollback, and incident recovery.
- [monitoring.md](monitoring.md) — alerting; what to do when an alert fires.
- [database-operations.md](database-operations.md) — running queries / migrations / DB ops.
- [reset-test-data.md](reset-test-data.md) — clearing test data out of an environment.

**Integration & API reference**

- [api-reference.md](api-reference.md) — the HTTP / route-handler surface.
- [integrations.md](integrations.md) — every external service, its env vars, and wiring.
- [stripe-webhooks.md](stripe-webhooks.md) — the Stripe webhook handler's event list + idempotency (canonical; cited by ADR 0011).
- [payments.md](payments.md) — who receives money and how payouts route.
- [analytics-setup.md](analytics-setup.md) — PostHog / first-party product analytics setup.

**Product / domain**

- [features.md](features.md) — what PickupVB does for hosts and players.
- [personas.md](personas.md) — named, detailed user personas.
- [feature-education.md](feature-education.md) — **end-user** onboarding / feature-discovery idea backlog (distinct from the contributor-focused `onboarding.md`).
- [example-events.md](example-events.md) — real tournament listings used as fixtures.
- [delight-backlog.md](delight-backlog.md) — low-impact "delight" ideas (fun CSS, favicon tricks, easter eggs, tiny games) with shipped/backlog status.

## History & decisions (append-only)

- [adr/](adr/) — architecture decision records, one per decision (hexagonal
  layering, Supabase Auth, typed domain errors, …). Numbered, long-lived. See
  [adr/README.md](adr/README.md).
- [journal/](journal/) — dated narrative per change-bundle: trigger, decisions,
  rejected alternatives, patterns, follow-ups. See [journal/README.md](journal/README.md)
  for the format and [journal/INDEX.md](journal/INDEX.md) to navigate by
  initiative. **Closed months are rolled into `YYYY-MM-digest.md`** (one anchored
  section per bundle); the current month stays as individual entries.

## Audits (point-in-time, with backlog)

- [audits/](audits/) — per-topic codebase audits (security, performance,
  accessibility, …) graded P1/P2/P3 with a dated remediation log. Start at the
  [audits/README.md](audits/README.md) index — its **Status** column is the
  at-a-glance open/closed summary; full detail lives at the top of each audit file.
