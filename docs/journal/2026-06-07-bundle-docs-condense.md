# 2026-06-07 — Bundle: docs/ condense + reorganize (docs-organization re-audit)

## Context

The `docs/` tree had grown to ~67,500 lines / ~430 files and was getting hard
for an agent to navigate. User asked to evaluate condensing/organizing it, with
the constraint that the **journey record stays** — docs exist so an agent can
reconstruct how the app was built. A docs-organization re-audit (reopened
[documentation.md](../audits/documentation.md)) found 1 P1 + 2 P2 + 3 P3, all
fixed here. The headline P1 was discovered while exploring: the audits index
([audits/README.md](../audits/README.md)) had ballooned to **825 KB across 54
lines** — the index table's Status column had absorbed full remediation
narratives (cells of 43 k+ chars) — and **exceeded the agent file-read cap**, so
the audit entry-point couldn't be opened at all.

## Decisions

- **Collapse the audits index, don't delete detail.** The per-audit narrative
  already lived at the top of each audit file; the index was duplicating it.
  Rebuilt Status cells as one-line summaries (825 KB → 6.5 KB), preserving the
  rubric anchor (8 inbound links) and header prose.
- **Link-preserving journal condense over plain deletion.** Chose to roll each
  closed month into a single `YYYY-MM-digest.md` with **one anchored section per
  bundle (anchor = slug)**, then rewrite the ~127 inbound audit/ADR citations to
  `…-digest.md#<slug>`. Rejected: (a) deleting May entries outright — would
  orphan 124 citations that are the load-bearing "why" behind audit findings;
  (b) archiving to a subfolder — doesn't shrink the agent-facing surface and
  still needs link rewrites. Distillation is intentionally lossy (title + the
  Context "why"); git retains the unabridged originals.
- **Kept `stripe-webhooks.md`** (considered for folding). It's 47 lines but a
  canonical reference cited by 14 links incl. two ADRs — folding churns
  long-lived ADR links for negligible gain.
- **Renamed `user-onboarding.md` → `feature-education.md`** to kill the
  near-identical collision with the contributor-focused `onboarding.md`.
- **Corrected 6 future-dated (`2026-12-04`) journal entries** — git showed they
  were authored 2026-05-28/29; folded into the May digest with a mislabel note.

## Changes

- [docs/audits/README.md](../audits/README.md) — index rebuilt to scannable
  one-line statuses; added an index/keep-it-short convention note.
- [docs/README.md](../README.md) — **new** top-level map of the whole tree.
- [docs/journal/2026-05-digest.md](2026-05-digest.md) — **new**; 236 May bundles
  condensed (incl. the 6 mislabeled bracket-`entry_id` ones).
- [docs/journal/INDEX.md](INDEX.md) — **new** navigation hub.
- [docs/journal/README.md](README.md) — added the digest convention + INDEX link.
- Deleted 230 `2026-05-*` + 6 `2026-12-04-*` individual entry files.
- Rewrote ~127 May citations across `docs/audits/*`, `docs/adr/*`,
  `apps/web/README.md`, `docs/analytics-setup.md` → digest anchors.
- `docs/user-onboarding.md` → [docs/feature-education.md](../feature-education.md)
  (+ redirected 7 refs incl. ADR 0035 ×3).
- [docs/audits/documentation.md](../audits/documentation.md) — reopened with
  graded findings D1–D6 + remediation.
- [AGENTS.md](../../AGENTS.md) — docs map in "Related reading"; index-cell +
  current-status-first convention; journal digest convention.

## Patterns observed

- **Index/summary cells rot into logs.** A "Status" cell with no length
  discipline becomes an append target until the file is unreadable. The fix is a
  hard convention (one line) + the detail living in exactly one place (the audit
  file top). Same shape as the ratchet-behind-migration pattern elsewhere.
- **Append-only narrative needs a periodic roll-up.** ~18 journal entries/day
  with no index is unnavigable; the per-month digest keeps the working tree
  legible without losing history (git holds the originals).
- **Git timestamps beat filename dates** for catching mislabeled entries.

## Follow-ups

- **June 2026 → digest** when the month closes (apply the same convention).
- **Audit-file status de-stacking** is convention-only so far; back-fixing the
  worst stackers (documentation.md has 15 blocks) is opportunistic, not blocking.
- **Body-text scale + raw-palette** docs ratchets remain open in
  [m3-alignment.md](../audits/m3-alignment.md) (unrelated to this bundle).
