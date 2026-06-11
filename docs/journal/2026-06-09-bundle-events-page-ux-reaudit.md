# Events page UX re-audit + remediation bundle 1 (2026-06-09)

## Context

User asked for a UX/UI audit of the event detail page
([apps/web/src/app/events/[id]/](../../apps/web/src/app/events/%5Bid%5D/)) —
bugs, gaps, streamlining, stale code — across all personas (host, player,
spectator). The
[events-page-ux audit](../audits/events-page-ux.md) was last touched 2026-05-28;
the page has since grown ~8 sections (Pass panel, Event chat, Teams, Tip, Media,
Badges, Waiver, Sponsor, hero image, manage banner) and the host console moved
to `/events/[id]/manage`. Re-walked the page, filed **EV-1 … EV-9**, then shipped
the high-confidence, self-contained fixes as bundle 1.

## Decisions

- **EV-1 — gave leagues their own `buildCta` branch** rather than letting them
  fall through to the open-play tail. The tail returned `'RSVP'` / `'Buy ticket'`
  while the panel below said "Register your team for the season," and returned
  `null` once the season started (so an in-progress league had no hero CTA).
  Chose to mirror the tournament shape: `'Register'` (anchor `#signup`) while
  signups are open, `'View schedule'` (internal link) once
  `hasStarted || completed`. Folded the open-state case into the existing
  `tournament || league` register branch since both register teams via the same
  panel.
- **EV-3 — used `inert` (conditional spread) over swapping `opacity` for
  `visibility/display`.** The bar fades via `opacity` transition; `display:none`
  / `visibility:hidden` would kill the transition. `inert` removes the
  still-rendered link from the tab order _and_ the a11y tree (fixing the
  focusable-node-inside-`aria-hidden` WCAG 4.1.2 violation) without touching the
  fade. React 19 / Next 16 types `inert` as a boolean DOM prop — typecheck clean.
- **EV-8 — migrated only the bordered-transparent neutral buttons** to
  `neutralButtonClass` (the sanctioned no-visual-change dedup). Left tip-jar's
  "Leave a tip" / preset toggles as-is: they're a surface-_filled_ control group
  (`bg-md-surface-container`), not standard CTAs, so converging them onto the
  transparent neutral class would flatten them — a recolor, not a dedup.
- **Scope — shipped EV-1/2/3/8/9; deferred EV-4/5/6/7.** EV-4 (section sprawl)
  and EV-5/6 are IA/product calls (tabs vs. disclosures, sticky-bar behavior
  when registered); EV-7 needs verification against a real single-division
  tournament before changing the "Spots" framing. Left as audit backlog.

## Changes

- [load-event-detail.ts](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts)
  — `buildCta`: league branch ("Register" open / "View schedule" started). (EV-1)
- [event-closed-state.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-closed-state.tsx)
  — "Manage event" link `/edit` → `/manage`; button → `neutralButtonClass('sm')`. (EV-2, EV-8)
- [event-sticky-cta.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-sticky-cta.tsx)
  — `inert` when hidden. (EV-3)
- [tip-jar.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/tip-jar.tsx)
  — validation `text-secondary` → `text-md-error`. (EV-8)
- [event-meta-section.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-meta-section.tsx)
  — fuchsia theme chip `bg-fuchsia-100/text-fuchsia-900` → `bg-fuchsia-500/15` + `dark:` fork. (EV-8)
- [rsvp-panel.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/rsvp-panel.tsx),
  [position-rsvp-panel.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/position-rsvp-panel.tsx)
  — "Leave event" + "Sign in" buttons → `neutralButtonClass`. (EV-8)
- [events-page-ux.md](../audits/events-page-ux.md) — findings EV-1…EV-9, remediation
  log, refreshed render-order map (EV-9); [audits README](../audits/README.md) index row.

## Patterns observed

- **CTA builders that branch on `event.type` need a `league` arm.** Leagues are
  an `event_type` container (not a separate aggregate), so they silently inherit
  open-play fallthrough wherever a `switch`/`if` chain only handles
  `tournament` / `open_play`. Worth grepping other `event.type ===` chains.
- **`opacity-0` is not "hidden" for a11y.** A faded-out but rendered control
  stays keyboard-focusable; pair the visual hide with `inert` (or render-gate the
  contents) so it leaves the tab order too.

## Follow-ups

Open in [events-page-ux.md](../audits/events-page-ux.md): **EV-4** (section
sprawl — group/tab the post-RSVP tail), **EV-5** (3× "Open bracket" controls on a
completed tournament), **EV-6** (sticky CTA is a non-action once registered),
**EV-7** (team-event "Spots" framing — verify host capacity config first).

## Verify

Standard quad green (`pnpm typecheck && lint && test && build`) — 356 tests
pass, 0 lint errors (3 pre-existing warnings in unrelated scoreboard files).
Not exercised in a running app / e2e — deploy-gated like the rest of the
uncommitted tree.
