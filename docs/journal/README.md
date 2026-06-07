# Journal

Dated narrative entries explaining **why** a bundle of changes was made and
**how** the codebase reached its current state. Sits alongside:

- [docs/adr/](../adr/) — one document per **architectural** decision
  (hexagonal layering, Supabase Auth, typed domain errors, …). Long-lived.
- [docs/audits/](../audits/) — point-in-time scan results per topic
  (security, performance, accessibility, …) with a P1/P2/P3 backlog and a
  dated remediation log.
- **Journal (this folder)** — the narrative thread that ties bundles of
  changes together: the trigger, the alternatives considered, the patterns
  observed, and the follow-ups deferred.

To navigate, start at [INDEX.md](INDEX.md): it lists the per-month **digests**
(closed months) and the current month's individual entries.

## When to write an entry

After shipping a non-trivial **change-bundle** — usually a group of related
edits committed together (a security/perf/a11y sweep, a feature increment,
an audit-driven remediation pass, a dependency upgrade with knock-on
fixes). Trivial typo fixes or single-line patches don't need an entry.

## File naming

`YYYY-MM-DD-<short-slug>.md` — e.g. `2026-06-07-bundle-private-players.md`. Use
the date the bundle landed (or is about to land). Multiple entries per day are
fine; use distinct slugs.

## Required sections

```markdown
# <Title> (YYYY-MM-DD)

## Context

What triggered this work? (audit finding, user request, dependency CVE,
lint warning sweep, …). Link the audit file or issue if any.

## Decisions

For each non-obvious choice: what was chosen, what was rejected, and why.
Format: "Chose X over Y because Z." Keep it terse.

## Changes

Short bullet list of files touched and what changed. One line each. Group
by area if there are many.

## Patterns observed

Recurring issues, gotchas, or missing primitives surfaced during this
bundle. If a pattern is durable, also add it to the "Patterns surfaced by
audits" section of AGENTS.md so future agents see it without reading the
journal.

## Follow-ups

Deferred work, with a one-line reason for deferral. Link the audit file
where the follow-up lives.
```

Optional sections: **Verify** (anything beyond the standard quad),
**Risks** (rollback story for risky changes).

## Style

- Concise. Bullet points beat paragraphs.
- Link files with workspace-relative paths and line numbers when useful.
- Don't restate diffs — Git already has them. Capture intent and trade-offs.
- Don't duplicate the audit P1/P2/P3 backlog here; reference it.

## Digests — condensing closed months

The journal is append-only and grows fast, so once a month closes its entries
are **rolled into a single `YYYY-MM-digest.md`** to keep the working tree
legible (the full entries stay in git history). The convention, established
2026-06-07 when May 2026 (236 entries) was condensed:

- **One anchored section per bundle**, heading = the original file slug
  (`### bundle-91`, `### standalone-brackets`), so the GitHub anchor is
  `#<slug>`. Slugs are unique within a month, so anchors don't collide.
- **Distill to title + the "why"** (the entry's Context), ~1–3 lines. The
  unabridged entry is recoverable from git — don't re-paste it.
- **Rewrite inbound citations** from `YYYY-MM-DD-<slug>.md` to
  `YYYY-MM-digest.md#<slug>` across `docs/audits/`, `docs/adr/`, and any other
  referrers, then delete the individual files. Verify zero links remain to the
  deleted paths (`grep -rnE 'YYYY-MM-[0-9]{2}-[a-z0-9-]+\.md' docs/`).
- The **current (active) month stays as individual entries** until it closes.

[INDEX.md](INDEX.md) lists the digests and the active month.
