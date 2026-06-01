# Profile hub goes player-first (PR-2) (2026-06-01)

## Context

Closes **PR-2** in [profile-page-ux.md](../audits/profile-page-ux.md). The hub
is primarily the player/attendee's home base, but its information architecture
led with **host** concerns: the three quick-action tiles were "Host an event"
(primary fill), "Payouts & Stripe", "Receipts", and the first content section
was Hosting — while the player's own activity sat at the bottom (Following) or
was missing (RSVPs, fixed in PR-1). A brand-new player landed on a hub that
pushed payout depth they had no use for yet.

## Decisions

- **Lead the quick actions with the player intent.** "Find events" is now the
  primary tile (was "Host an event"), followed by Messages and Receipts. This is
  the one change that flips the hub's first impression from "set up your
  business" to "go play."
- **Keep "Host an event" universal, but demote it.** Hosting is an action any
  user can take, and the home page / nav already surface it — so it stays as a
  secondary tile rather than disappearing for non-hosts. Only the genuinely
  host-only tile is gated (below). Chose this over host-gating "Host an event"
  itself, which would create a chicken-and-egg ("can't host until you've
  hosted") and remove a legitimate aspiration path.
- **Gate "Payouts & Stripe" on `isHost`.** It's useless to someone who's never
  hosted (nothing to get paid for), so it renders only when
  `upcomingHosted.length > 0 || getHostStripeAccount(user.id) !== null`. Chose
  the Stripe-account signal (not just "has upcoming events") so a host _between_
  events keeps their payout link. Folded `getHostStripeAccount` into the existing
  `isPro` / `isPlatformAdmin` `Promise.all` — no extra round-trip.
- **Build the tile set inline, not via a config array.** Four-to-five tiles with
  one conditional reads fine as JSX; a `.map` over a tile-descriptor array would
  be more machinery than the count justifies (playbook: don't add a pattern that
  earns nothing).
- **Reorder sections player-first: Your events → Following → Hosting → Groups →
  Videos.** Only Following actually moved (up from the bottom, past Hosting/
  Groups/Videos); Your events already led after PR-1. The edit/photo/privacy
  blocks stay at the bottom — they're maintenance, not the daily-driver content.

## Changes

- [profile/page.tsx](../../apps/web/src/app/profile/page.tsx) —
  imported `getHostStripeAccount`; added it to the `Promise.all` + derived
  `isHost`; rewrote the Quick actions nav (player-first, adaptive payout tile);
  moved the Following section above Hosting.

## Patterns observed

- **"Adaptive by persona" beats "show everything."** The hub had been additive —
  every capability got a tile for everyone. Gating one tile on a cheap, already-
  loaded signal (`isHost`) is a low-risk way to make a shared surface read
  correctly for the persona in front of it. Worth repeating for other
  mixed-persona dashboards (e.g. the host/payout depth on group pages) if they
  show the same one-size-fits-all tendency.

## Follow-ups

Remaining profile-hub items, all in
[profile-page-ux.md](../audits/profile-page-ux.md):

- **PR-3 (P3)** — no first-run onboarding on an empty hub.
- **PR-4 (P3)** — "Edit profile" collapsed while the Avatar/Hero editors sprawl
  open; co-locate under one disclosure.
- **PR-5 (P3)** — the primary "Find events" tile (now `variant="primary"`) still
  uses `hover:opacity-90` instead of the M3 state-layer every `primaryButtonClass`
  surface uses. PR-2 moved which tile is primary; it did **not** touch the tile's
  hover treatment — that's still PR-5's job.
- **PR-6** — anon users see the full host/payout hub; tracked by persona-ux
  **V-4**.
