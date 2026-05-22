# Events Page UX Audit

_Last updated: 2026-05-18_

Audit of [apps/web/src/app/events/[id]/page.tsx](../../apps/web/src/app/events/%5Bid%5D/page.tsx).
Goal: prioritize the most important information and CTAs for visitors landing
from a share link, while keeping the page useful for hosts and attendees.

> **Status:** Quick-win bundle + larger-changes bundle both shipped
> (2026-05-18). Remaining open items live in the "Won't-do / explicit
> deferrals" section.

> **Status update (2026-05-22):** UX findings still closed. Architectural
> note: the page is now 837 LOC (was ~520 when this audit ran) — see the
> [architecture audit](architecture.md) P1 regression and the
> [performance audit](performance.md) new P1 #0 (`Date.now()` in render at
> [page.tsx#L115](../../apps/web/src/app/events/%5Bid%5D/page.tsx#L115)).
> Both belong in the next page-diet pass.## Render order (current)

```
Back link
Flash alerts (created / tip)

EventHero
  ├─ Tags row
  ├─ Title
  ├─ Sub-line: date · city · spots · price
  ├─ Closing-soon pill (when registration closes ≤72h)
  ├─ Primary CTA (RSVP / Buy / Register / Open bracket / View attendees)
  └─ Secondary: Share, Edit (host)

When / Spots grid
EventMetaSection (dl: series · fundraiser · sanctioning · closes · payment notes)
ExternalRegistrationCard (when external)
DivisionsSection

Signup (id="signup")
  - open_play: PaidTicketPanel | PositionRsvpPanel | RsvpPanel
  - tournament: TournamentRegistrationTabs (Register team / Free agent)

EventClosedState (cancelled / completed / hasStarted pivot)

Description
Rules
Bracket card (tournament)

Where (address + map + osm link)
Hosts
Host tools <details> (host-only)
  ├─ HostDivisionsManager
  └─ HostBroadcastPanel
Teams registered (tournament, id="teams")
Players signed up (open_play, id="attendees")
Tip jar (non-hosts)

EventStickyCta (mobile-only, hides when #signup is in view)
```

## Quick wins shipped (2026-05-18, first bundle)

- **Hero sub-line** with date · city · spots · price (free vs `$X.XX`
  derived from `attendeeChargeBreakdownAsync`).
- **Description + Rules** moved up to immediately after the signup panel.
- **Bracket card** promoted out of the page-bottom slot.
- **Host tools disclosure** — `HostDivisionsManager` + `HostBroadcastPanel`
  collapsed into a single `<details>` block.

## Larger changes shipped (2026-05-18, second bundle)

### 1. `EventHero` with primary CTA + countdown — **shipped**

[apps/web/src/app/events/[id]/\_components/event-hero.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-hero.tsx).
Renders the tags row, title, meta sub-line, closing-soon pill (visible
only when `registrationClosesAt` is within 72h), the primary CTA, and the
Share / Edit secondary actions. CTA selection lives at the page level
(`getPrimaryCta` IIFE in `page.tsx`) so it can read `event.status`,
`hasStarted`, viewer auth, paid/free, and `isAttending`.

### 2. Tabbed tournament registration — **shipped**

[tournament-registration-tabs.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/tournament-registration-tabs.tsx).
Client wrapper that takes the existing `TournamentSignupPanel` and
`FreeAgentSignupPanel` server components as children and switches between
them. Tab labels carry count badges ("Register team (3) · Free agent (2)").
The wrapper carries `id="signup"` so hero and sticky CTAs anchor to it.

### 3. Sticky mobile bottom CTA bar — **shipped**

[event-sticky-cta.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-sticky-cta.tsx).
Mobile-only (`sm:hidden`). Mirrors the hero CTA and uses an
`IntersectionObserver` against `#signup` to fade out once the inline panel
scrolls into view. Pads for `safe-area-inset-bottom` for iOS notches.

### 4. Closed-state pivot — **shipped**

[event-closed-state.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-closed-state.tsx).
Replaces the bare "Signups are closed" `<p>`. Three branches:

- `status === 'cancelled'` → red notice, no CTA.
- `status === 'completed'` → "View bracket" (tournament) or "View attendees" (open play).
- `hasStarted` (still published) → same pivot + a host-only "Manage event" button.

### 5. `EventMetaSection` as a `<dl>` — **shipped**

[event-meta-section.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/event-meta-section.tsx).
Two-column definition list (`grid-cols-[max-content_1fr]`) on `sm+`,
stacked on mobile. The `Row` helper handles the term/description pairing.
`hideRegistrationCloses` prop is wired in but not currently set — the dl
keeps the precise date while the hero shows the urgency pill, so the two
are complementary rather than duplicative.

### 6. "Teams registered (N)" section — **shipped**

[teams-registered-section.tsx](../../apps/web/src/app/events/%5Bid%5D/_components/teams-registered-section.tsx).
Always-visible read-only roster for tournaments, mirroring the open-play
"Players signed up" section. Renders under `id="teams"`.

### 7. Bracket promotion when status ≥ ready — **shipped (partial)**

The hero CTA now resolves to **Open bracket** when `hasStarted` or
`status === 'completed'` on tournaments, and `EventClosedState` repeats
the same CTA inside the closed-state notice. No new domain field added —
we read `hasStarted` and `status` directly. The original Bracket card
still renders in-flow below Description/Rules; promoting it visually into
the hero would require duplicating the card shell and isn't justified
given the hero CTA already covers the primary click target.

## Won't-do / explicit deferrals

- **Removing the When/Spots grid**: the grid still adds value for at-a-glance
  scanning; replacing it with a single dense card was considered and felt
  worse on mobile.
- **Moving Hosts above signup**: hosts are decision context but not as
  important as price/date/spots; current order is correct.
- **Auto-collapsing Description above ~N characters**: nice-to-have, not
  worth the complexity for now.
