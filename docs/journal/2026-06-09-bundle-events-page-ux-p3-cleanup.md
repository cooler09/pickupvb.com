# Event page EV-5/6/7 cleanup — close the events-page-ux re-audit (2026-06-09)

## Context

Third and final remediation bundle for the
[events-page-ux re-audit](../audits/events-page-ux.md), clearing the remaining
P3 backlog (EV-5, EV-6, EV-7). With these landed, EV-1 … EV-9 are all closed.

## Decisions

- **EV-5 (redundant bracket/schedule CTAs) — suppress the sub-page card on
  started/completed events** rather than fold it into the closed-state. On a
  started/completed tournament the bracket was reachable three ways (hero
  "Open bracket" + `EventClosedState` "View bracket" + the standalone
  `EventSubpageLink` card); leagues had two (and EV-1's new league hero CTA
  would have made it three). Gating the card on `!hasStarted && status !==
'completed'` keeps it only while signups are upcoming — where it's the _only_
  bracket/schedule preview (the hero CTA there is "Register") — and leaves the
  started/completed case at hero + closed-state (one top action + one in-context).
- **EV-6 (sticky CTA non-action) — suppress, don't repoint.** Once the viewer
  has taken the primary action while signups are open, `buildCta` degrades the
  hero to "You're in — view details" (a scroll-to-self non-action), which the
  mobile sticky bar mirrored persistently. Computed `viewerHasRegistered`
  (RSVP'd / positioned / waitlisted / captained / joined a team / free-agent —
  the same predicate the signup panels use for their smart-collapse) and render
  the bar only when `!(signupsOpen && viewerHasRegistered)`. Started/completed
  events keep the bar — there the CTA is real navigation ("Open bracket" etc.).
  Repointing it at "Open chat"/"View roster" was the alternative; suppression is
  lower-risk and the jump nav (EV-4) already covers those destinations.
- **EV-7 (team-event "Spots" framing) — verified then re-framed in teams.**
  Confirmed event-level `capacity` is null for team events, so the cell read
  "Unlimited" even when a single division capped teams (and the hero hid its
  chip). Rather than push player framing onto team events, the page now computes
  a `teamSummary` — total registered teams, the team cap **summed across
  divisions** (null if any team division is uncapped, so per-division caps stay
  in `DivisionsSection`), and a `reliable` flag (false for external events,
  whose on-platform count is partial). The When/Spots right cell renders a
  **"Teams"** label with `registered / cap teams` (or a count / "Unlimited", or
  the cap alone when unreliable). The hero's per-player spots chip is nulled for
  team events. Formatting stays in the component; the page supplies structured
  data + the `reliable` flag (it owns `isExternal`).

## Changes

- [page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx) — `teamSummary` /
  `isTeamEvent` / `viewerHasRegistered` / `showStickyCta` at the page boundary;
  sub-page card gated to upcoming events; hero `spotsRemaining` nulled for team
  events; sticky CTA render-gated.
- [event-when-spots-section.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-when-spots-section.tsx)
  — optional `teamSummary` prop + a "Teams"-framed cell branch.

## Patterns observed

- **Player-capacity primitives leak onto team events.** `spotsRemaining` /
  `attendeeCount` are individual-signup concepts; any surface that renders them
  needs a team branch for tournament/league (the divisions own the real caps).
  Worth checking other capacity surfaces (discovery cards already null
  `spotsRemaining` for team events via the primary-division check).

## Follow-ups

Events-page-ux backlog is now empty. Sole remaining nice-to-have (deferred,
noted in the audit): group/collapse the passive bottom tail
(Tip/Badges/Waiver/Sponsor) behind disclosures.

## Verify

Quad green (`pnpm typecheck && lint && test && build`) — 356 web + 149
application tests, 0 lint errors (3 pre-existing scoreboard warnings). Runtime
behaviour (sticky suppression by registration state, the Teams cell across
single/multi/external divisions) wants a real-app / e2e pass — deploy-gated like
the rest of the uncommitted tree.
