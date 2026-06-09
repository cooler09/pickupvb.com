# Journal index

Navigation hub for the change-bundle journal. For the entry format and when to
write one, see [README.md](README.md).

## How the journal is organized

- **Closed months → a digest.** Each finished month is rolled into a single
  `YYYY-MM-digest.md` — one anchored section per bundle (anchor = the original
  file slug, e.g. `#bundle-91`), distilled to its title + the "why". The full
  unabridged entries stay in git history. Citations point at digest anchors
  (`YYYY-MM-digest.md#<slug>`).
- **Current month → individual entries.** The active month keeps one file per
  bundle (`YYYY-MM-DD-<slug>.md`) so detail is at hand while work is in flight.
  When the month closes, it gets rolled into its digest.

## Digests (closed months)

- [2026-05-digest.md](2026-05-digest.md) — **May 2026** (236 bundles: the
  initial audit-remediation sweeps through the early feature build-out; includes
  the bracket `entry_id` cutover that was mislabeled `2026-12-04`).

## Active month

- **June 2026** — 134 individual entries, `2026-06-01-…` through the latest. The
  most recent shipped work; not yet digested.

## Navigating by topic / initiative

Journal entries trace initiatives that are anchored by ADRs and tracked in the
audits. To find the narrative for a feature:

1. Start at the **ADR** for the decision ([../adr/README.md](../adr/README.md))
   — e.g. chat → ADR 0028, brackets → ADR 0032, waitlist → ADR 0036.
2. Or the relevant **audit** for the remediation thread
   ([../audits/README.md](../audits/README.md)).
3. Then `grep` the journal for the slug/feature keyword — June entries by
   filename, May by section heading inside the digest.
