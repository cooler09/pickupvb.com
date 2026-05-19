# Events Page UX Audit

_Last updated: 2026-05-18_

Audit of [apps/web/src/app/events/[id]/page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx).
Goal: prioritize the most important information and CTAs for visitors landing
from a share link, while keeping the page useful for hosts and attendees.

## Render order after quick-win pass

```
Back link
Flash alerts (created / tip)

HERO
  ├─ Tags row
  ├─ Title
  ├─ Sub-line: date · city · spots · price
  └─ Secondary actions: Share, Edit (host)

When / Spots grid
EventMetaSection (series · fundraiser · sanctioning · close · payment notes)
ExternalRegistrationCard (when external)
DivisionsSection

Signup panel
  - open_play: PaidTicketPanel | PositionRsvpPanel | RsvpPanel
  - tournament: TournamentSignupPanel + FreeAgentSignupPanel
  - closed notice if started

Description
Rules
Bracket card (tournament)

Where (address + map + osm link)
Hosts
Host tools <details> (host-only)
  ├─ HostDivisionsManager
  └─ HostBroadcastPanel
Players signed up (open_play)
Tip jar (non-hosts)
```

## Quick wins shipped

- **Hero sub-line** with date · city · spots · price (free vs `$X.XX` derived
  from `attendeeChargeBreakdownAsync`). Puts the four highest-signal facts
  one scroll above the fold.
- **Description + Rules** moved up to immediately after the signup panel —
  they're decision content, not appendix content.
- **Bracket card** promoted out of the page-bottom slot to sit right after
  Description/Rules for tournaments. Anyone running an event in progress
  finds the CTA before they pass attendees and tip jar.
- **Host tools disclosure** — `HostDivisionsManager` + `HostBroadcastPanel`
  now live in one `<details>` block after the Hosts section. Reduces noise
  for non-hosts (still rendered nothing) and gives hosts a single entry
  point.

## Larger changes (deferred — design + new components)

These weren't quick wins because they require a new component or domain
shape change. Listed in roughly the order of expected ROI.

### 1. `EventHero` with primary CTA + countdown

Replace the current header + When/Spots grid with a single hero block:

- Title + tags
- Primary CTA button (RSVP / Buy ticket / Register team / Open bracket if
  status >= ready)
- Sticky-on-mobile copy of that CTA so the action is always one tap away
- Countdown ("Closes in 6h") when `registrationClosesAt` is within 72h
- Secondary: Share, Edit (host)

Affects: [page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx), new
`_components/event-hero.tsx`. Requires choosing the CTA based on event
type, status, viewer auth, signup state — currently scattered across
`RsvpPanel`, `PaidTicketPanel`, `TournamentSignupPanel`. Hero would render
a small button; the existing panels stay as the expanded form below.

### 2. Tabbed `TournamentRegistrationPanel`

Combine `TournamentSignupPanel` and `FreeAgentSignupPanel` into a single
tabbed card: "Register team" / "Free agent". Halves vertical bloat on
tournament pages and resolves the choice-paralysis of stacking both at
equal visual weight.

Affects: new `_components/tournament-registration-panel.tsx`; deletes the
two existing panel imports from `page.tsx`. Internal logic re-uses the
existing components as tab bodies.

### 3. Sticky mobile bottom CTA bar

A fixed-position bottom bar on `< sm` viewports with the primary action
(RSVP / Buy / Register). Disappears when the inline panel is in viewport.

Affects: new `_components/event-sticky-cta.tsx`. Requires an
`IntersectionObserver` against the inline panel; must coordinate with any
existing mobile nav to avoid stacking conflicts.

### 4. Closed-state pivot

When `event.status === 'published' && hasStarted`, the current text-only
"Signups are closed" notice should pivot to relevant follow-ups:

- Tournament → "View bracket" CTA
- Open play → "View attendees" / "See results"
- All → permalink to results if past
- Host → "Mark complete" / "Cancel event" / "Add results"

Affects: a small `_components/event-closed-state.tsx`; replaces the
inline `<p>` in `page.tsx`.

### 5. Collapse `EventMetaSection` into a `<dl>`

The optional fields (series, fundraiser, sanctioning, theme tags, close
time, payment notes) read as a noisy list of pills. A two-column
definition list is denser and easier to scan. Promote `registrationClosesAt`
into the hero countdown (see #1) and remove the duplicate venue name with
"Where".

Affects: [event-meta-section.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-meta-section.tsx).

### 6. Tournament "Teams registered (N)" headline

Open-play pages get a `Players signed up (N)` section near the bottom.
Tournaments hide the team list inside `TournamentSignupPanel`. Add a
parallel `Teams registered (N)` section so viewers can scan participants
without entering the signup form.

Affects: new `_components/teams-list.tsx`; render in `page.tsx` after
Hosts.

### 7. Bracket promotion when status ≥ ready

Currently the bracket card always sits in the same slot. For events with
status `in_progress` or `completed`, the bracket is the most-clicked
action — promote it into the hero (or directly under the hero sub-line)
when there are seeded teams or completed matches.

Depends on a new domain field (`event.bracketState: 'none' | 'seeded' | 'in_progress' | 'completed'`)
or a query against the `matches` table. Cheap query already exists for
seeded count.

## Won't-do / explicit deferrals

- **Removing the When/Spots grid**: the grid still adds value for at-a-glance
  scanning; replacing it with a single dense card was considered and felt
  worse on mobile.
- **Moving Hosts above signup**: hosts are decision context but not as
  important as price/date/spots; current order is correct.
- **Auto-collapsing Description above ~N characters**: nice-to-have, not
  worth the complexity for now.
