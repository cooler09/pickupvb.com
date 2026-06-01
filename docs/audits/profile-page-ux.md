# Profile Hub UX Audit

_Last updated: 2026-06-01_

UX/UI evaluation of the **player's authenticated hub**
([apps/web/src/app/profile/page.tsx](../../apps/web/src/app/profile/page.tsx)) —
the page a user lands on after signing in, and the home base the nav's avatar
links to.

Goal: make the hub answer the **player/attendee** persona's first question —
_"what am I signed up for / what's my next game / what needs my attention"_ —
before it leans into host + payout depth.

This file is complementary to — not a duplicate of:

- [home-page-ux.md](home-page-ux.md) / [find-events-ux.md](find-events-ux.md) /
  [events-page-ux.md](events-page-ux.md) — the public discovery funnel
  (`/` → `/events` → `/events/[id]`). This is the **post-conversion** hub.
- [persona-ux.md](persona-ux.md) — the site-wide persona model + CTA/field
  vocabulary. The anon-depth gap here (PR-6) is the **V-4** theme; the primary-
  tile drift (PR-5) cross-refs CC-1/CC-3. Not re-graded.
- [privacy.md](privacy.md) — the "Download my data" / "Delete account" block
  ([page.tsx#L365-L389](../../apps/web/src/app/profile/page.tsx#L365-L389)) is a
  privacy-audit surface; UX of it is fine, so it's not re-litigated here.

> **Status update (2026-06-01):** File created from a full persona-lens
> evaluation of the profile hub. **The headline shipped the same day: PR-1 ✅** —
> a new `GetAttendingEvents` query + `EventReadModels.listAttending` port +
> Supabase adapter now power a **"Your events"** section (rendered with the
> shared `EventCard`) above Hosting, so the player can finally see the games
> they've RSVP'd to. Remaining open: four **P3** items (PR-2…PR-5) and one
> cross-ref to persona-ux V-4 (PR-6). **No P1**: the page works; `robots:
noindex` is set ([page.tsx#L27-L30](../../apps/web/src/app/profile/page.tsx#L27-L30))
> and the owner reads their own `profiles` row on the session client
> (RLS-correct). See **Remediation log** + journal
> [2026-06-01-profile-your-events.md](../journal/2026-06-01-profile-your-events.md).

---

## Persona model

See [persona-ux.md](persona-ux.md#the-persona-model-as-the-nav-encodes-it). This
page is primarily the **player/attendee** hub, secondarily a **host** dashboard:

| Persona               | What the hub must make obvious                                                               |
| --------------------- | -------------------------------------------------------------------------------------------- |
| **Player / attendee** | "My next game / what I RSVP'd to," pending invites, the people I follow — **lead with this** |
| **Host / organizer**  | Upcoming events I'm hosting, payouts/Stripe, a fast "new event" — present, but secondary     |
| **Anonymous user**    | A claim nudge before host/payout depth (today the full hub renders for anon — PR-6 / V-4)    |

---

## What's already good (so we don't regress it)

- **Pending team invites** render as a dedicated amber "action required" block
  ([page.tsx#L230-L254](../../apps/web/src/app/profile/page.tsx#L230-L254)) —
  exactly the right treatment for a thing that needs the user to act. Model for
  any future "action required" item (e.g. PR-1's "you're on a waitlist").
- **Pagination** on Hosting / Videos / Following follows the shared
  `pageParam` + `scrollToId` convention (AGENTS.md pattern #12) — `hpage` /
  `vpage` / `fpage`, totals over the full set.
- **`Public view ↗`** gives the player a one-tap path to see their public
  `/players/[handle]` card — good "preview as others see me" affordance.

---

## Findings

### A. Player-persona coverage (the hub's primary job)

#### PR-1 — The player's hub omits the player's own events (RSVPs / attending) · **P2** (headline) · ✅ resolved 2026-06-01

The hub surfaces events the user **hosts** (`loadVisibleHostedEvents`,
[page.tsx#L115-L118](../../apps/web/src/app/profile/page.tsx#L115-L118) →
Hosting section [#L256-L289](../../apps/web/src/app/profile/page.tsx#L256-L289))
but has **no section for events the user has RSVP'd to / is attending**. For the
persona whose hub this is, _"what am I signed up for / when's my next game"_ is
the single most important question — and it's answerable **nowhere**:

- The nav (header + bottom-nav) has no "My events" destination — only Events
  (discovery), Community, Groups, Players, Teams, Host, Profile, Messages.
- The hub shows Hosting / Groups / Videos / Following (people) — not attended
  events.
- There was **no attending-events query in the app layer**; participation is
  read only inside payment / refund / event-detail paths. (The participation
  table is `event_participants` — `event_attendees` was collapsed into it by
  migrations `20260802`/`20260808`; the original finding cited the stale name.)
- The Following feed (`/events?when=following`) is _"events from people you
  follow,"_ **not** _"events I joined."_

So a player who RSVPs to a game has to remember it and navigate back manually —
the one workflow a hub exists to remove.

**Fix (done):**

1. New `GetAttendingEventsQuery(viewerId, startsAfter, limit?)` + `EventReadModels.listAttending`
   port, implemented by `SupabaseEventRepository.listAttending` — reads the
   viewer's `event_participants` rows (role `attendee`), resolves the event ids
   through the division join, then hydrates the full `VolleyballEventSummary`
   (divisions/prices/capacity/hero) from `events_view` + `event_divisions` in JS,
   mirroring `searchFollowingFeed` (no `search_events` RPC change — cf. F-13).
   `startsAfter` is passed from the page boundary so the read side stays
   clock-free; `distanceKm` is null (no location on the hub).
2. A **"Your events"** section renders above Hosting with the shared `EventCard`
   (so the H-1 card wins — price/capacity/thumbnail/relative date — come for
   free), paginated with an `apage` param like Hosting's `hpage`, with an empty
   state that links to `/events`.
3. _Deferred:_ a dedicated **"My events"** nav destination (PR-2 territory —
   the hub section covers the core need for now).

Graded **P2** — a high-leverage player gap, but not ship-blocking (RSVPs were
recoverable via the event page / notifications) and the fix was a real increment
(new query + port), so it wasn't a same-day quick win like home H-1.

#### PR-2 — Quick actions + section order are host-weighted on a player-first hub · **P3**

The three quick-action tiles
([page.tsx#L210-L227](../../apps/web/src/app/profile/page.tsx#L210-L227)) are all
host / payment-oriented — **"Host an event"** (primary fill), **"Payouts &
Stripe,"** **"Receipts"** — and the first content section is **Hosting**. The
player's own activity sits at the bottom (Following) or is missing entirely
(RSVPs — PR-1). For a hub whose primary persona is the player/attendee, the IA
leads with host concerns a brand-new player has no use for yet.

**Recommended fix:** lead the quick actions with player intents (Find events /
Your events / Messages) and make the host/payout tiles **adaptive** — show
"Payouts & Stripe" once the user has hosted or has a Stripe account, not to
everyone by default. Reorder content sections player-first: Your events (PR-1) →
Following → Hosting → Groups → Videos. P3 (ties to PR-1).

### B. First-run & information architecture

#### PR-3 — The empty/first-run hub has no onboarding · **P3**

A brand-new user lands on a stack of empty sections (no events, no groups, no
videos, no following) — each has its own empty state, but there's no top-level
"get started" guidance and no profile-completeness signal (avatar / home city /
positions all unset). The first impression of one's own hub is a wall of
nothing.

**Recommended fix:** when the profile is sparse (no city/positions/avatar +
zero activity), render a single lightweight onboarding card at the top —
"Complete your profile" (deep-link the Edit disclosure open) + "Find your first
event" — in place of, or above, the empty sections. P3.

#### PR-4 — "Edit profile" is collapsed, but the Avatar + Hero editors sprawl open below it · **P3**

Name / city / positions / socials hide behind a `<details>` disclosure
([page.tsx#L337-L348](../../apps/web/src/app/profile/page.tsx#L337-L348)), while
the Avatar and Hero-image panels render **fully expanded** right below it
([#L350-L363](../../apps/web/src/app/profile/page.tsx#L350-L363)). So "edit my
identity" is split in two — the form is one click away, the photo editors are
always open — and the always-open panels push the Privacy section far down the
page.

**Recommended fix:** co-locate all three under one "Edit profile" disclosure (or
a single "Profile & photos" card), so the edit affordances live together and the
hub stays scannable. P3.

### C. Design-system consistency

#### PR-5 — The primary "Host an event" tile drifts from the canonical primary surface · **P3**

The primary `ActionTile`
([page.tsx#L444-L446](../../apps/web/src/app/profile/page.tsx#L444-L446)) styles
itself `bg-primary text-primary-fg rounded-shape-sm … hover:opacity-90`. The
token is right (`text-primary-fg`, not a hardcoded `text-white`), but the hover
is a one-off `opacity-90` instead of the **M3 state-layer** every
`primaryButtonClass` surface uses — so a "primary" affordance on the hub hovers
differently from every other primary affordance in the app.

**Recommended fix:** bridge the tile to the shared state-layer treatment (extract
the state-layer utility, or have the tile compose `primaryButtonClass`'s chassis
where layout allows). Cross-ref persona-ux **CC-1/CC-3**. P3 (minor — it's a
hover nuance, not a token error).

### D. Persona coverage (cross-ref)

#### PR-6 — Anonymous users see the full host/payout hub with no claim gate → persona-ux **V-4** (not re-graded)

An `is_anonymous` user passes the `if (!user) redirect(...)` guard
([page.tsx#L77](../../apps/web/src/app/profile/page.tsx#L77)) and sees the entire
hub, including "Host an event" and "Payouts & Stripe." The site-wide anon→claim
banner (nav) is the current mitigation, but the hub itself surfaces host/payment
depth to a user who can't use it. Same theme as persona-ux **V-4** (P3, open).
**Not re-graded** — optionally gate the host/payout quick actions on
`!isAnonymous` here when V-4 is addressed.

---

## Remediation log

### 2026-06-01 — "Your events" / attending feed (PR-1)

Shipped the headline player-persona gap the same day the file was created.
Hexagonal feature increment across domain → application → infrastructure → web,
with a handler unit test. Verified `pnpm typecheck && lint && test && build`
(all green). Journal:
[2026-06-01-profile-your-events.md](../journal/2026-06-01-profile-your-events.md).

- **PR-1 ✅** — new `EventReadModels.listAttending` port
  ([event-repository.ts](../../packages/domain/src/events/event-repository.ts)),
  `GetAttendingEventsQuery` + `GetAttendingEventsHandler`
  ([messages.ts](../../packages/application/src/messages.ts),
  [event-queries.handler.ts](../../packages/application/src/queries/event-queries.handler.ts)
  - [test](../../packages/application/src/queries/get-attending-events.handler.test.ts)),
    `SupabaseEventRepository.listAttending`
    ([supabase-event-repository.ts](../../packages/infrastructure/src/supabase-event-repository.ts)),
    wired in [handlers.ts](../../apps/web/src/lib/handlers.ts), and a **"Your
    events"** section on the hub rendered with the shared `EventCard`
    ([profile/page.tsx](../../apps/web/src/app/profile/page.tsx)). Migration-free —
    hydrates from `events_view` + `event_divisions` like `searchFollowingFeed`.

_Open: PR-2 (player-first quick actions + order), PR-3 (first-run onboarding),
PR-4 (co-locate edit affordances), PR-5 (primary-tile state-layer parity). PR-6
lives with persona-ux V-4._
