# Onboarding E1 — empty states as teachers (2026-06-04)

## Context

Third onboarding bundle, after the [B1/B2 checklist cards](2026-06-04-bundle-onboarding-checklists.md)
and the [M1 funnel](2026-06-04-bundle-onboarding-m1-funnel.md). Closes **E1** from
the [user-onboarding backlog](../feature-education.md): _"make every empty state a
teacher"_ — replace blank/sad empty lists with a one-line **why**, a single
primary **CTA**, and a short **what-this-unlocks**, reusing the existing CTA
vocabulary. E1 is the cheap companion to the checklists: their steps point users
at `/events`, `/groups`, `/messages`, etc., so those surfaces should teach when
they're empty.

## What the inventory found

Swept every empty-state site (`border-dashed` boxes, "No … yet" copy,
`emptyState` props). The result reframed the work: **most directory empty states
already teach.** `/events` has a strong bespoke empty state (title + reason +
primary/secondary CTAs, filter-aware); `/groups` and `/teams` already had a
title + why + a real CTA (`NewGroupButton` / "+ New team"). The genuinely weak,
CTA-less ones were **`/messages`** (a plain `<p>` — "No conversations yet. Join or
open a team to start chatting.") and **`/players`** (a dashed `<p>`, no action).
Profile-hub section empties already carry inline links and now sit under the
onboarding checklist, so they were left alone.

So E1 here is: **establish the canonical primitive + bring the directory empties
onto it**, not a from-scratch teaching pass.

## What shipped

- **`EmptyState` primitive** ([components/empty-state.tsx](../../apps/web/src/components/empty-state.tsx))
  — a server component card with `title` (what), `description` (why), `unlocks`
  (a subtle "here's what this unlocks" line), and `primary` / `secondary`
  `{ href, label }` CTAs rendered with the shared `primaryButtonClass` /
  `secondaryButtonClass` (AGENTS.md pattern #11). A `children` slot takes a custom
  action node (e.g. the self-hiding client `NewGroupButton`) — passing a client
  _element_ through a server component is fine (only a _function_ would trip the
  RSC boundary pitfall).
- **`/messages`** — the bare `<p>` became an `EmptyState` with a "Find events" CTA
  and an "unlocks" line. The clearest win (it had no action at all).
- **`/players`** — split into filtered ("No players match those filters" + "Clear
  filters") vs. truly-empty ("No players yet" + "Find events" + unlocks).
- **`/groups`** and **`/teams`** — migrated their bespoke dashed boxes onto the
  primitive, preserving the search-vs-empty branching and existing CTAs, and
  adding the uniform "unlocks" framing. Four directories now share one component.
- `/events` kept its bespoke `EmptyState` — it has filter-specific branching and
  already exceeds the E1 bar; refactoring it would be churn for no gain.

## Patterns observed

- **An "empty state as teacher" primitive is a small ratchet.** Like the CTA /
  field vocabularies, one component for "what + why + unlocks + CTA" keeps new
  empty states consistent and on-brand instead of re-deriving a dashed box each
  time. New unbounded lists (and the deferred host "first registration" step)
  have a home now.
- **Audit before assuming.** The backlog framed E1 as a broad teaching pass; the
  inventory showed the app was already ~80% there, so the work collapsed to a
  primitive + two real fixes + two consolidations. Cheaper than the brief implied.

## Follow-ups

- Remaining onboarding backlog: the host **"first registration" payoff step** and
  the **`compute_onboarding_stats` RPC + `user_onboarding` persistence** (only
  justified by a future "you're 1 step away" nudge; Docker-gated), plus **C1**
  (looping GIFs at decision points). All in [feature-education.md](../feature-education.md).
- The `EmptyState` primitive is available for any future unbounded-list empty —
  prefer it over a new bespoke dashed box.
