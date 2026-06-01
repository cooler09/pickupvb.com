# Profile hub: primary-tile state-layer parity (PR-5) (2026-06-01)

## Context

Closes **PR-5** in [profile-page-ux.md](../audits/profile-page-ux.md) — the last
gradeable finding on the profile hub. The primary quick-action `ActionTile`
("Find events" after PR-2 reordered the tiles) used a one-off `hover:opacity-90`
for its hover, while every `primaryButtonClass` surface in the app uses the M3
**`state-layer`** (a `currentColor` overlay at the system hover/focus/pressed
alphas). So the hub's headline affordance hovered differently from every other
primary affordance.

## Decisions

- **Apply the `state-layer` utility to the tile rather than `primaryButtonClass`.**
  The tile is a card-shaped `Link` (`block p-4`, two text lines), not a
  button (`primaryButtonClass` is `inline-flex items-center justify-center`), so
  the button chassis doesn't fit. `state-layer` is the right seam: it's the
  decomposed hover/focus/pressed primitive the buttons themselves compose, it
  sets its own `position: relative; isolation: isolate`, paints a `::after`
  overlay with `border-radius: inherit`, and is `pointer-events: none` — so it
  drops onto the existing `rounded-shape-sm` card with no layout change.
- **Drop the host `transition` too.** It only existed to animate the
  `hover:opacity-90` on the host element; `state-layer` animates its own overlay
  opacity, so the host transition is now dead weight.
- **Leave the secondary tile's `hover:border-primary/40` alone.** That's the
  standard clickable-card hover used across the app (EventCard, group cards,
  pending-invite rows), not a primary-surface drift — the finding was scoped to
  the filled-primary tile's `opacity` hack. Converting the card hover to a
  state-layer would diverge from those siblings.

## Changes

- [profile/page.tsx](../../apps/web/src/app/profile/page.tsx) — `ActionTile`
  primary branch: `transition hover:opacity-90` → `state-layer`.

## Patterns observed

- **`state-layer` is the bridge for non-button primary surfaces.** When a tile /
  card / custom affordance needs the M3 hover signature but can't adopt
  `primaryButtonClass`'s button chassis, drop the bare `state-layer` utility on
  it — it's self-contained (position, isolation, radius-inherit, pointer-events)
  and gives the exact same hover/focus/pressed overlay the buttons use. Reach for
  it before hand-rolling `hover:opacity-*` / `hover:bg-*` on a new interactive
  surface.

## Follow-ups

- **PR-6** — anon users see the full host/payout hub with no claim gate; tracked
  by persona-ux **V-4** (not re-graded here). With PR-5 done, the profile-hub
  audit ([profile-page-ux.md](../audits/profile-page-ux.md)) has no open findings
  of its own — re-audit only if the page changes materially.
