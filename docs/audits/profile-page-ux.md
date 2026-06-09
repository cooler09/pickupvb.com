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

> **Status update (2026-06-08):** Re-audit of the hub after its split into
> `_loaders/load-profile-page.ts` + `_components/`. The five 2026-06-01 findings
> (PR-1…PR-5) remain resolved; this pass surfaced **4 P3s, none ship-blocking**,
> all now closed: **PRV-1** (this file was stale — described a removed
> `HeroImagePanel` + pre-refactor line numbers) corrected; **PRV-3** (a
> missing-profile-row edge produced a `/players/<uuid>` 404 link) fixed via a
> threaded `hasPublicHandle`; **PRV-4** (the `discoverable` copy over-promised
> privacy) resolved by the public-profile **PUB-2** fix (de-index + sitemap
> exclusion of opted-out players); **PRV-2** (quick-action grid is host/payment-
> weighted) assessed → **wontfix** — the only mechanical fix regresses the
> deliberate "always render the payout tile so new users can find Stripe
> onboarding" decision in the loader. The public `/players/[id]` surface is now
> its own audit file ([public-profile-ux.md](public-profile-ux.md)). See
> **Re-audit findings (2026-06-08)** below.

> **Status update (2026-06-01):** Full persona-lens evaluation of the profile
> hub — **all five gradeable findings (PR-1…PR-5) shipped the same day; nothing
> open but the PR-6 cross-ref to persona-ux V-4.** PR-1 — a new
> `GetAttendingEvents` query + `EventReadModels.listAttending` port + Supabase
> adapter power a **"Your events"** section (shared `EventCard`), so the player
> sees the games they've RSVP'd to. PR-2 — the hub is now **player-first**: quick
> actions lead with "Find events" (host depth is adaptive); sections read Your
> events → Following → Hosting → Groups → Videos. PR-3 — a brand-new user (sparse
> profile + zero activity) gets a single **"Welcome to PickupVB"** get-started
> card instead of a wall of empty sections. PR-4 — the profile-photo + hero-image
> editors now live **inside** the "Edit profile" disclosure with the form. PR-5 —
> the primary quick-action tile uses the shared **`state-layer`** hover (was a
> one-off `hover:opacity-90`). **No P1**: the page works; `robots: noindex` is set
> ([page.tsx#L27-L30](../../apps/web/src/app/profile/page.tsx#L27-L30)) and the
> owner reads their own `profiles` row on the session client (RLS-correct). See
> the **Remediation log** + the dated profile journals under `docs/journal/`.

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

#### PR-2 — Quick actions + section order are host-weighted on a player-first hub · **P3** · ✅ resolved 2026-06-01

The three quick-action tiles
([page.tsx#L210-L227](../../apps/web/src/app/profile/page.tsx#L210-L227)) are all
host / payment-oriented — **"Host an event"** (primary fill), **"Payouts &
Stripe,"** **"Receipts"** — and the first content section is **Hosting**. The
player's own activity sits at the bottom (Following) or is missing entirely
(RSVPs — PR-1). For a hub whose primary persona is the player/attendee, the IA
leads with host concerns a brand-new player has no use for yet.

**Fix (done):** quick actions now lead with the player intent — **"Find
events"** is the primary tile (was "Host an event"), followed by **Messages**
and **Receipts**; **"Host an event"** is kept but demoted to a secondary tile,
and **"Payouts & Stripe"** is now **adaptive** — it renders only when `isHost`
(`upcomingHosted.length > 0 || getHostStripeAccount(...) !== null`), so a player
who's never hosted no longer sees payout depth. Content sections were reordered
player-first: **Your events → Following → Hosting → Groups → Videos** (Following
moved up from the bottom). [profile/page.tsx](../../apps/web/src/app/profile/page.tsx).
The primary-tile hover treatment is untouched here — that's **PR-5**.

### B. First-run & information architecture

#### PR-3 — The empty/first-run hub has no onboarding · **P3** · ✅ resolved 2026-06-01

A brand-new user lands on a stack of empty sections (no events, no groups, no
videos, no following) — each has its own empty state, but there's no top-level
"get started" guidance and no profile-completeness signal (avatar / home city /
positions all unset). The first impression of one's own hub is a wall of
nothing.

**Fix (done):** when the profile is sparse **and** there's zero activity
(`!home_city && positions.length === 0 && !avatar_url`, and no attending/hosted
events, follows, groups, or videos) the hub now leads with a single lightweight
**"Welcome to PickupVB"** card — a 3-step list: _Complete your profile_
(deep-links the Edit disclosure open via `?edit=1#edit-profile`), _Find your
first event_ (`/events`), _Follow some players_ (`/players`). The card vanishes
the moment the user fills any profile field or takes any first action, so it
never nags an established user. The Edit `<details>` gained `id="edit-profile"`

- `open={editOpen}` (native, so still user-toggleable after the deep-link).
  [profile/page.tsx](../../apps/web/src/app/profile/page.tsx). P3.

#### PR-4 — "Edit profile" is collapsed, but the Avatar + Hero editors sprawl open below it · **P3** · ✅ resolved 2026-06-01

Name / city / positions / socials hide behind a `<details>` disclosure
([page.tsx#L337-L348](../../apps/web/src/app/profile/page.tsx#L337-L348)), while
the Avatar and Hero-image panels render **fully expanded** right below it
([#L350-L363](../../apps/web/src/app/profile/page.tsx#L350-L363)). So "edit my
identity" is split in two — the form is one click away, the photo editors are
always open — and the always-open panels push the Privacy section far down the
page.

**Fix (done):** the `AvatarPanel` and `HeroImagePanel` now render **inside** the
"Edit profile" `<details>` content (after `ProfileForm`, `space-y-6`), so all
three identity-edit affordances open together behind one disclosure and the
always-open photo cards no longer push Privacy down the page. The summary hint
gained "photos"; the PR-3 deep-link (`?edit=1#edit-profile`) now reveals the
photo editors too. [profile/page.tsx](../../apps/web/src/app/profile/page.tsx). P3.

### C. Design-system consistency

#### PR-5 — The primary quick-action tile drifts from the canonical primary surface · **P3** · ✅ resolved 2026-06-01

> Note: PR-2 moved which tile is primary — it's now **"Find events"** (was "Host
> an event") — but the `hover:opacity-90` drift travelled with the
> `variant="primary"` branch, so PR-5 applies unchanged.

The primary `ActionTile`
([page.tsx#L444-L446](../../apps/web/src/app/profile/page.tsx#L444-L446)) styles
itself `bg-primary text-primary-fg rounded-shape-sm … hover:opacity-90`. The
token is right (`text-primary-fg`, not a hardcoded `text-white`), but the hover
is a one-off `opacity-90` instead of the **M3 state-layer** every
`primaryButtonClass` surface uses — so a "primary" affordance on the hub hovers
differently from every other primary affordance in the app.

**Fix (done):** the primary `ActionTile` branch swapped `transition
hover:opacity-90` for the shared **`state-layer`** utility — the same
`currentColor`-overlay-at-M3-alphas signature `primaryButtonClass` uses for
hover/focus/pressed — so the hub's primary tile now hovers identically to every
other primary surface. The tile keeps its card chassis (`block p-4`,
`rounded-shape-sm`); `state-layer` supplies its own `position`/`isolation` and
inherits the radius. The secondary tile's `hover:border-primary/40` is left
as-is — that's the standard clickable-card hover used app-wide (EventCard, group
cards), not a drift. Cross-ref persona-ux **CC-1/CC-3**.
[profile/page.tsx](../../apps/web/src/app/profile/page.tsx). P3.

### D. Persona coverage (cross-ref)

#### PR-6 — Anonymous users see the full host/payout hub with no claim gate → persona-ux **V-4** (not re-graded)

An `is_anonymous` user passes the `if (!user) redirect(...)` guard
([page.tsx#L77](../../apps/web/src/app/profile/page.tsx#L77)) and sees the entire
hub, including "Host an event" and "Payouts & Stripe." The site-wide anon→claim
banner (nav) is the current mitigation, but the hub itself surfaces host/payment
depth to a user who can't use it. Same theme as persona-ux **V-4**.

**Resolved via V-4 (2026-06-01):** the profile hub's "Host an event" tile (like
every host entry point) funnels to `/events/new`, which now redirects anonymous
users to `/claim?next=/events/new` — so the tile no longer drops an anon user
into the bare create-event form. The "Payouts & Stripe" tile is already gated on
`isHost` (PR-2), and an anon user has no Stripe account, so it doesn't show. No
profile-local change was needed. See persona-ux V-4 + journal
[2026-06-01-anon-host-gate.md](../journal/2026-06-01-anon-host-gate.md).

---

## Re-audit findings (2026-06-08)

A second pass after the hub was split into
[\_loaders/load-profile-page.ts](../../apps/web/src/app/profile/_loaders/load-profile-page.ts)

- [\_components/](../../apps/web/src/app/profile/_components/). All P3. PRV-1
  (stale doc) corrected, PRV-3 (uuid-link 404) fixed, and PRV-4 resolved via the
  public-profile PUB-2 fix; PRV-2 assessed → wontfix (see below).

#### PRV-1 — This audit file was stale · **P3** · ✅ corrected 2026-06-08

The file read "all resolved," but PR-4 described an `AvatarPanel` **+
`HeroImagePanel`** co-located in the Edit disclosure, and cited line numbers from
before the page split. The page no longer renders any `HeroImagePanel`
([page.tsx#L134-L142](../../apps/web/src/app/profile/page.tsx#L134-L142) — only
`AvatarPanel`), and the old `page.tsx#L…` citations no longer resolve.
**Corrected** by this re-audit header; PR-4's hero reference is superseded
(profiles carry no hero image — `heroImageUrl` in the loader is on the **event**
cards, not the profile).

#### PRV-2 — Quick-action grid drifted back to host/payment weight · **P3** · assessed → wontfix (2026-06-08)

PR-2 deliberately demoted host depth, but the grid is now **7 tiles**
([profile-hub-sections.tsx](../../apps/web/src/app/profile/_components/profile-hub-sections.tsx)) —
Find events, Messages, Notifications, Receipts, My passes, Host an event, and
Payouts/Get-set-up — of which **Receipts, My passes, Host an event, and
Payouts/Get-set-up** are payment/host-oriented (4 of 7). (The Notifications tile
was added 2026-06-08 at the user's request, grouped with Messages as comms.)

**Assessed → wontfix.** The obvious fix (gate the host tiles behind `isHost`)
conflicts with a **deliberate, in-code decision**: the loader comment
([load-profile-page.ts](../../apps/web/src/app/profile/_loaders/load-profile-page.ts))
keeps the payout tile **always rendered** precisely so a brand-new user has a
_discoverable path to Stripe onboarding before they've created any events_ —
gating it behind host status (the original PR-2 attempt) "left no discoverable
path to set up payments," so only its **copy** adapts. "Host an event" is
likewise circular to gate (you can't become a host without it; it's already
anon-claim-gated via V-4). And of the four "payment-ish" tiles, **Receipts** and
**My passes** are legitimately player-facing (anyone who bought a ticket/pass).
The order is already player-first (Find events → Messages → Receipts → …). Net:
the premise is somewhat overstated and the only mechanical fix regresses a
considered decision — left as-is. Revisit only if the hub adds a dedicated
"host mode" toggle, at which point host depth can collapse behind it.

#### PRV-3 — Handle/avatar return-path can become a `/players/<uuid>` 404 · **P3** · ✅ fixed 2026-06-08

When the `profiles` row is missing, `profile.handle` falls back to `user.id`,
so "Public view ↗" and the avatar `returnPath` became `/players/<uuid>`, which
404s. Edge case (a profile-row trigger normally prevents it). **Fixed:** the
loader now returns `hasPublicHandle = Boolean(row?.handle)`
([load-profile-page.ts](../../apps/web/src/app/profile/_loaders/load-profile-page.ts));
the identity hero hides "Public view" when it's false
([profile-hub-sections.tsx](../../apps/web/src/app/profile/_components/profile-hub-sections.tsx)),
and the avatar `returnPath` falls back to `/profile`
([page.tsx](../../apps/web/src/app/profile/page.tsx)).

#### PRV-4 — `discoverable` copy over-promised privacy · **P3** · ✅ resolved via PUB-2 (2026-06-08)

The toggle read _"Turn this off to stay private"_
([profile-form.tsx#L288-L289](../../apps/web/src/app/profile/profile-form.tsx#L288-L289)),
but the public page stayed indexed regardless. As of 2026-06-08 the public page
de-indexes and is dropped from the sitemap when `discoverable = false`
([public-profile-ux.md](public-profile-ux.md) PUB-2), so the copy now matches
behavior (hidden from search, directory, _and_ crawlers; still reachable by
direct link).

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

_Open after PR-1: PR-2 (player-first quick actions + order), PR-3 (first-run
onboarding), PR-4 (co-locate edit affordances), PR-5 (primary-tile state-layer
parity). PR-6 lives with persona-ux V-4._

### 2026-06-01 — Player-first hub (PR-2)

Web-only IA pass on the same hub. Verified `pnpm typecheck && lint && test &&
build` (all green). Journal:
[2026-06-01-profile-player-first.md](../journal/2026-06-01-profile-player-first.md).

- **PR-2 ✅** — quick actions reordered to lead with the player intent ("Find
  events" is now the primary tile; Messages + Receipts follow; "Host an event"
  demoted to secondary). "Payouts & Stripe" is now **adaptive** — gated on
  `isHost` (`upcomingHosted.length > 0 || getHostStripeAccount(...) !== null`),
  folded into the existing `isPro`/`isPlatformAdmin` `Promise.all`. Content
  sections reordered player-first: **Your events → Following → Hosting → Groups →
  Videos** (Following moved up). [profile/page.tsx](../../apps/web/src/app/profile/page.tsx).

_Open after PR-2: PR-3 (first-run onboarding), PR-4 (co-locate edit affordances),
PR-5 (primary-tile state-layer parity). PR-6 lives with persona-ux V-4._

### 2026-06-01 — First-run "Get started" card (PR-3)

Web-only first-run nudge on the same hub. Verified `pnpm typecheck && lint &&
test && build` (all green). Journal:
[2026-06-01-profile-onboarding.md](../journal/2026-06-01-profile-onboarding.md).

- **PR-3 ✅** — a brand-new user (`profileIncomplete && hasNoActivity`) now sees
  a single **"Welcome to PickupVB"** card at the top with a 3-step list —
  _Complete your profile_ (deep-links the Edit `<details>` open via
  `?edit=1#edit-profile`), _Find your first event_ (`/events`), _Follow some
  players_ (`/players`) — instead of a wall of empty sections. The card is an
  AND of "sparse profile" + "zero activity," so it vanishes after any first
  action; the Edit disclosure gained `id="edit-profile"` + `open={editOpen}` and
  stays user-toggleable. [profile/page.tsx](../../apps/web/src/app/profile/page.tsx).

_Open after PR-3: PR-4 (co-locate edit affordances), PR-5 (primary-tile
state-layer parity). PR-6 lives with persona-ux V-4._

### 2026-06-01 — Co-locate the identity editors (PR-4)

Web-only IA tidy on the same hub. Verified `pnpm typecheck && lint && test &&
build` (all green). Journal:
[2026-06-01-profile-edit-colocate.md](../journal/2026-06-01-profile-edit-colocate.md).

- **PR-4 ✅** — `AvatarPanel` + `HeroImagePanel` moved **inside** the "Edit
  profile" `<details>` content (after `ProfileForm`, `space-y-6`), so the three
  identity editors open together behind one disclosure instead of the two photo
  cards sprawling always-open below it (which had pushed Privacy far down). The
  PR-3 `?edit=1#edit-profile` deep-link now reveals the photo editors too; the
  summary hint gained "photos". [profile/page.tsx](../../apps/web/src/app/profile/page.tsx).

_Open after PR-4: PR-5 (primary-tile state-layer parity). PR-6 lives with
persona-ux V-4._

### 2026-06-01 — Primary-tile state-layer parity (PR-5)

One-line design-system tweak on the same hub. Verified `pnpm typecheck && lint
&& test && build` (all green). Journal:
[2026-06-01-profile-tile-state-layer.md](../journal/2026-06-01-profile-tile-state-layer.md).

- **PR-5 ✅** — the primary `ActionTile` branch swapped `transition
hover:opacity-90` for the shared **`state-layer`** utility (the
  `currentColor`-overlay-at-M3-alphas signature `primaryButtonClass` uses), so
  the hub's primary tile hovers identically to every other primary surface. Card
  chassis kept; `state-layer` supplies its own position/isolation and inherits
  the radius. The secondary tile's `hover:border-primary/40` (the app-wide
  clickable-card hover) is intentionally left as-is.
  [profile/page.tsx](../../apps/web/src/app/profile/page.tsx).

**All gradeable findings (PR-1…PR-5) are now resolved. Only PR-6 remains, and it
lives with persona-ux V-4.**
