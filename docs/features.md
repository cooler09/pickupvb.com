# Business features

What PickupVB actually does for hosts and players, with pointers to where
each feature is implemented. Companion to
[integrations.md](integrations.md) (external services) and
[adr/](adr/) (architecture decisions). For domain invariants in code see
[packages/domain/README.md](../packages/domain/README.md).

---

## 1. Event hosting

The core surface. A host creates an event; players RSVP; the host runs
it on game day.

**Domain enums** ([packages/domain/src/events/enums.ts](../packages/domain/src/events/enums.ts)):

- **Surface** — `indoor` / `grass` / `sand`.
- **Format** — `sixes` / `quads` / `triples` / `doubles`.
- **Gender** — `mens` / `womens` / `coed`.
- **SkillLevel** — `beginner` / `intermediate` / `advanced` / `competitive`
  (legacy search band; per-division ladder is `SkillTier`
  `c / b / bb / bb3 / a / aa / open` — see [ADR 0006](adr/0006-event-divisions.md)).
- **EventType** — `open_play` / `tournament` / `league`.
- **EventStatus** — `draft` / `published` / `cancelled` / `completed`.

**Surface × format rule** ([packages/domain/src/events/rules.ts](../packages/domain/src/events/rules.ts)):
indoor allows only sixes or quads. Grass/sand allow sixes, quads,
triples, or doubles. Enforced in the domain aggregate, the form
validator, and a Postgres `CHECK` constraint — same predicate in three
places.

### Event-type matrix

The three first-class event types differ along five axes. The matrix
below is the canonical reference; the aggregate enforces each row's
invariants in [packages/domain/src/events/volleyball-event.ts](../packages/domain/src/events/volleyball-event.ts)
(see `assertRegistrationConfigValid` and the open-play / league
branches). Source-of-truth audit:
[docs/audits/event-data-model.md](audits/event-data-model.md#product-requirements-restated).

| Event type     | Cadence         | Roster shape                                                                             | Divisions           | Free agents                        | Bracket / schedule                         |
| -------------- | --------------- | ---------------------------------------------------------------------------------------- | ------------------- | ---------------------------------- | ------------------------------------------ |
| **Open Play**  | Single day      | Individuals only (`team_registration_mode = null`, `team_composition = solo`)            | 1 (always)          | N/A                                | None                                       |
| **Tournament** | 1–N days        | Teams: partners / pair-draw / full team; walk-ins; host-edited day-of                    | 1..N                | Per-division pool, host-toggleable | Bracket per division                       |
| **League**     | Weekly × season | **Pre-defined rostered teams** (`team_registration_mode = roster`, non-solo composition) | 1..N (skill + type) | Per-division pool, host-toggleable | Season schedule + optional playoff bracket |

Cross-cutting rules:

- Host always retains full edit control over teams, rosters, and the
  schedule on tournaments and leagues. Open Play stays the simple
  individual RSVP flow.
- Payments route through `events.host_id` (a user) regardless of
  type. `host_group_id` is authorization / display metadata, never
  payout routing — see [docs/payments.md](payments.md) and
  [AGENTS.md § Pattern 7](../AGENTS.md).
- Leagues are **season-fee upfront only** — no recurring billing.
  The Stripe wiring reuses the one-shot Checkout used by tournament
  team registration.

**Open play vs tournament vs league.**

- _Open play_ — capacity is by player count (or unlimited). RSVPs and
  the waitlist live in `event_attendees`.
- _Tournament_ — capacity is by team count. Teams sign up via
  `event_teams` and players who don't have a team can register as
  **free agents** so captains can pick them up.
- _League_ — rostered teams are pre-defined (every division must use
  `team_registration_mode = roster` and a non-solo composition).
  Weekly fixtures live in a dedicated season-schedule table; the
  playoff bracket at season end is optional per division (host
  toggle). See [ADR 0006 § Addendum](adr/0006-event-divisions.md#addendum-2026-05-30--league-event-type).

**Lifecycle.** Draft → Published → (Cancelled | Completed). Publish/
cancel/complete go through the aggregate so invariants stay enforced
(see `volleyball-event.ts`).

---

## 2. RSVP & capacity

- **Spot counts are live.** `event_attendees` and `event_teams` are in
  the `supabase_realtime` publication; the event page subscribes via
  `useEventAttendees` so every viewer sees the same number.
- **Waitlist.** When capacity is hit, new RSVPs land on the waitlist
  (`event_attendees.waitlist = true`) instead of being rejected. Spots
  promote off the waitlist automatically when someone leaves.
- **Positional sign-up** (open play). Hosts can enable a positional
  roster (setter/outside/opposite/middle/libero/DS) — see
  `EventPosition` in
  [packages/domain/src/events/enums.ts](../packages/domain/src/events/enums.ts).
  Player position defaults come from
  `profiles.{primary,secondary,tertiary}_position`. Over-fill is
  allowed; surplus signups go to the waitlist.
- **Guest (anonymous) RSVP.** Players without an account can sign up
  via Supabase anonymous auth, gated by Cloudflare Turnstile to keep
  bots out (see [integrations.md](integrations.md#cloudflare-turnstile)).
  They can later "claim" the account via [claim/](../apps/web/src/app/claim/)
  to upgrade to a real login.
- **Co-hosts.** A host can add other users or whole groups as co-hosts
  (`event_co_hosts`) — they share edit, broadcast, and attendee
  management permissions. Implemented at
  [apps/web/src/app/events/[id]/co-host-actions.ts](../apps/web/src/app/events/%5Bid%5D/co-host-actions.ts).

---

### Waiver acknowledgement + signature tracking

**Not a legal-waiver substitute** — hosts who need one have their own (insurer /
sanctioning body / DocuSign) and often collect signatures in person. This is a
free-for-any-host, **soft** (never blocks sign-up) tool to surface the rules /
their real waiver and track who's acknowledged it:

- **Author** (`event_waivers`, versioned, mask-at-write — any host, from the edit
  panel): a **link to your own waiver** (`external_url`) and/or pasted rules
  `body` (at least one).
- **Attendees acknowledge online** — click-wrap (type name + agree) on the event
  page ([event-waiver-section.tsx](../apps/web/src/app/events/%5Bid%5D/_components/event-waiver-section.tsx))
  → `waiver_signatures` (`method='self'`, self-RLS, one per event+user, upserted;
  a body edit bumps the version and prompts re-sign).
- **Host records in-person signatures** at their discretion — a free-text name
  → `waiver_signatures` (`method='in_person'`, `user_id` null, `recorded_by` =
  host, admin client). The edit panel lists all signatures (Online / In person +
  date) with remove.
- **Soft by design:** touches no join/checkout path. Monetization O-9 — shipped
  **free** 2026-06-08 (the maintainer chose not to paywall a safety tool).
  Deferred (possible premium hooks): hard-gating sign-up on a signature,
  team/tournament (captain-vs-player) waivers, signed-PDF export.

---

## 3. Visibility & discovery

`Visibility` enum gates who can see/find an event:

| Value                  | Meaning                                               |
| ---------------------- | ----------------------------------------------------- |
| `public`               | Discoverable by anyone; anyone can sign up            |
| `invite_only`          | Only via direct link                                  |
| `friends_of_host`      | Discoverable by the host's friends                    |
| `friends_of_attendees` | Discoverable by friends of anyone currently attending |

Enforced both in Postgres RLS (source of truth) and replicated to the
domain layer for in-process checks. Friend graph is owned by
`UserProfile` ([packages/domain/src/users/user-profile.ts](../packages/domain/src/users/user-profile.ts)).

**Discovery surfaces.**

- Home feed at `/` — geo-sorted public events.
- "Near me" button uses browser geolocation
  ([apps/web/src/app/events/near-me-button.tsx](../apps/web/src/app/events/near-me-button.tsx)).
- Geocoding for city/venue search uses Photon → Nominatim fallback
  (see [integrations.md](integrations.md#photon-komoot)).

---

## 4. Payments — paid events

Money flows host ← Stripe ← buyer via Stripe Connect. The platform
never holds funds.

**Pricing model** ([apps/web/src/lib/event-pricing.ts](../apps/web/src/lib/event-pricing.ts)):

- `price_cents = 0` → free event; Stripe is not invoked at all.
- `price_cents > 0` → paid event. Host picks `host_absorbs_fee`:
  - **Buyer-paid fee** (default): buyer is charged ticket price + platform fee as line items.
  - **Host-absorbs**: buyer pays only the ticket price; the platform fee comes out of the host's payout.
- **Refund window** (`refund_window_hours`, default 24, max 720). Inside the window, leaving the event auto-refunds via Stripe; outside the window the host has to refund manually. Logic at [apps/web/src/lib/refund-window.ts](../apps/web/src/lib/refund-window.ts).

**Platform fee** (charged by PickupVB, separate from Stripe processing fee):

| Tier     | Fee on tickets                      | Fee on tips |
| -------- | ----------------------------------- | ----------- |
| Free     | 5%                                  | **0%**      |
| Pro Host | 2.5% (`PRO_PLATFORM_FEE_BPS = 250`) | **0%**      |

Tips take **no** platform fee on any tier (ADR 0014 tip-fee amendment,
2026-06-01) — `tipPlatformFeeCents()` in
[apps/web/src/lib/event-pricing.ts](../apps/web/src/lib/event-pricing.ts)
returns 0. Ticket-fee constants in
[apps/web/src/lib/pro.ts](../apps/web/src/lib/pro.ts).

**Connect onboarding.** Hosts complete a Stripe Express account link
before they can publish a paid event. Account state is mirrored to
`host_stripe_accounts` via the `account.updated` webhook (see
[docs/stripe-webhooks.md](stripe-webhooks.md)). The new-event form
links to onboarding if charges aren't enabled yet.

**Checkout & fulfillment.**

- Buyer clicks "Reserve" → server creates a Stripe Checkout Session via
  [apps/web/src/lib/checkout-session.ts](../apps/web/src/lib/checkout-session.ts).
- Session expires after a fixed window (seat is reserved during the
  hold).
- `checkout.session.completed` writes the attendee row and a ticket
  purchase row.
- `checkout.session.expired` releases the reserved seat back to the
  pool.
- `charge.refunded` removes the attendee and notifies them.

### Group payouts — Club tier (ADR 0038)

By default an event pays out to `events.host_id` (a user). A group on the paid
**Club** tier (`group_subscriptions`, ~$25/mo) can connect its **own** Stripe
Connect account (`group_stripe_accounts`) and opt group-hosted events to pay out
to the club instead.

- **Resolver:** the per-event flows (ticket / team / tip) resolve their
  destination via `getEventPayoutAccount(eventId, hostId)`
  ([lib/event-payout.ts](../apps/web/src/lib/event-payout.ts)) — group account if
  the event opted in (`events.payout_group_id`), else the host user's.
- **Opt-in is per-event + immutable once sold:** set on the event edit page
  ("Club payouts" panel) only while the price is unlocked; frozen after the first
  paid registration, like `host_id`.
- **No host fallback:** if a group-routed event's club account isn't ready, the
  resolver returns null ("not ready") — it never routes club money to the host.
- **Manage:** `/groups/[slug]/billing` (owner/admin) — subscribe to Club, connect
  the payout account. Selling Club is gated to group owners/admins.
- **Multi-admin Pro (O-2a):** an active Club confers full Pro benefits on the
  group's **owners/admins** — `hasProBenefits` ORs in `user_has_club_benefits`,
  so club admins get the fee discount, unlimited paid events, passes/memberships,
  etc. (plain members don't).
- **Club dashboard (O-2b/c):** `/groups/[slug]/analytics` (owner/admin + Club) —
  engagement (events hosted, attendees, scoped to `host_group_id`) + **payout
  income** (gross/net/est-payout scoped to `payout_group_id` — what the club's
  Stripe account received, invisible to a host before this).
- **Scope:** routing covers ticket/team/tip only; passes + memberships stay
  host-user routed. Full write-up:
  [payments.md § Group payouts](payments.md#group-payouts-club-tier).

---

## 5. Pro Host subscription

Recurring subscription for serious organizers.
[apps/web/src/app/pricing/page.tsx](../apps/web/src/app/pricing/page.tsx)
is the public-facing surface; [/profile/billing/pro](../apps/web/src/app/profile/billing/pro/)
runs checkout.

**Pricing.**

- $10/mo or $100/yr (save $20).
- 14-day free trial.
- Cancel anytime; you keep Pro through the period you've paid for.

**What Pro unlocks.**

| Capability              | Free                                           | Pro                                               |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------- |
| Free events             | Unlimited                                      | Unlimited                                         |
| Paid events / 30 days   | 1 (rolling window — `FREE_PAID_EVENT_CAP_30D`) | Unlimited                                         |
| Platform fee on tickets | 5%                                             | **2.5%**                                          |
| Platform fee on tips    | None                                           | None                                              |
| Standalone brackets     | 1 active at a time                             | Unlimited                                         |
| Sell season passes      | —                                              | ✓ ([ADR 0037](adr/0037-season-passes.md))         |
| Sell memberships        | —                                              | ✓ ([ADR 0037 Phase 2](adr/0037-season-passes.md)) |
| CSV attendee export     | —                                              | ✓                                                 |
| Pro badge on profile    | —                                              | ✓ (opt-out via `show_pro_badge`)                  |

**Implementation.**

- Domain port: [packages/domain/src/payments/host-subscription.ts](../packages/domain/src/payments/host-subscription.ts).
- Active check: `isPro(userId)` reads the Postgres `is_pro_host` RPC,
  which treats `active` and `trialing` as Pro and grace-periods
  `past_due`.
- Free-tier cap is enforced by `host_paid_event_count_30d` RPC — a
  rolling 30-day window from "now", _not_ a calendar month. Cancelling
  a paid event does **not** free up the slot (prevents abuse).
- Subscription state is mirrored from Stripe via
  `customer.subscription.{created,updated,deleted}` webhooks into
  `host_subscriptions`.
- Billing portal access goes through `openBillingPortal` server action.

### Season passes (Pro capability)

A Pro host sells a **prepaid pack of session credits** — e.g. a "10-session
open-play pass" — that an attendee buys once and redeems per session, instead of
paying every event. Full design: [ADR 0037](adr/0037-season-passes.md).

- **Sell (Pro only):** create/manage packs at
  [/profile/billing/passes](../apps/web/src/app/profile/billing/passes/) —
  title, credit count, price, optional expiry. Stored in `host_passes`.
- **Buy (any account):** a buyer purchases a pack as a **destination charge to
  the host** (tiered platform fee, exactly like a ticket — host-routed, see
  [payments.md](payments.md)). Balance lives in `pass_purchases`; the buyer sees
  it at [/profile/passes](../apps/web/src/app/profile/passes/).
- **Opt in per event:** the host flags an open-play event
  `events.accepts_pass_credits` (edit page). v1 is open-play only.
- **Redeem:** on an eligible event the buyer hits "Use a pass credit"
  ([`PassPanel`](../apps/web/src/app/events/%5Bid%5D/_components/pass-panel.tsx)),
  which reserves a normal attendee spot via the atomic `redeem_pass_credit`
  SECURITY DEFINER RPC (capacity trigger fires, **no charge**). Cancelling
  returns the credit automatically (participant-delete cascade decrements
  `pass_purchases.credits_used`).
- **Helpers:** [lib/passes.ts](../apps/web/src/lib/passes.ts) (reads) +
  [lib/pass-helpers.ts](../apps/web/src/lib/pass-helpers.ts) (pure: credits
  remaining, expiry). Purchase fulfillment is the `pass_purchase` checkout kind
  in [webhooks/checkout.ts](../apps/web/src/lib/webhooks/checkout.ts).
- **v1 follow-ups:** pass income isn't yet in the earnings page / tax CSV (host
  sees revenue on the management page); no buyer-paid fee line (host absorbs the
  platform fee).

### Recurring memberships (Pro capability, ADR 0037 Phase 2)

The recurring sibling of passes: a Pro host sells a **monthly membership**;
while a member's subscription is active they claim a **free** spot on any of the
host's `accepts_pass_credits` open-play events — unlimited, no credit ledger.

- **Sell (Pro only):** create/manage plans at
  [/profile/billing/memberships](../apps/web/src/app/profile/billing/memberships/)
  (title, monthly price). Stored in `host_membership_plans`.
- **Subscribe (any account):** a buyer subscribes via a **Connect destination
  subscription** (Stripe Checkout `mode: 'subscription'`, `transfer_data` to the
  host + `application_fee_percent` at the host's tier — host-routed, see
  [payments.md](payments.md)). State mirrors into `host_memberships` from the
  `customer.subscription.*` webhook (keyed on `metadata.kind = 'host_membership'`).
- **Claim:** on an eligible event, an active member hits "Claim your spot"
  ([`PassPanel`](../apps/web/src/app/events/%5Bid%5D/_components/pass-panel.tsx)) →
  `claim_membership_spot` RPC reserves a normal attendee spot (capacity trigger
  fires, **no charge**). Member claims always take precedence over pass credits.
- **Manage:** the member sees + cancels (at period end) at
  [/profile/passes](../apps/web/src/app/profile/passes/); cancel calls Stripe
  directly (the subscription lives on the platform account — no billing portal).
- **Active rule:** `is_active_member(user, host)` — trialing/active, or past_due
  within a 30-day period-end grace (same backstop as `is_pro_host`).
- **v1 follow-ups:** monthly only (no annual); unlimited-access only (no
  credit-refill variant); membership income not yet in the earnings page / CSV.

### Referrals — earn Pro (ADR 0039)

A host can refer other hosts and earn free Pro. Share `/r/<your-user-id>`
([app/r/[code]/route.ts](../apps/web/src/app/r/%5Bcode%5D/route.ts) drops a
30-day cookie, or attributes immediately if already signed in); the **auth
callback** records the `referrals` row for genuinely-new accounts only. When a
referred host publishes **≥3 paid events** (checked from
[events/new/actions.ts](../apps/web/src/app/events/new/actions.ts) via
`maybeQualifyReferral`), the referrer earns **30 days of Pro** as a row in
`pro_grants` — which `hasProBenefits()` honors, so it unlocks every Pro perk
(stacks across referrals). Surfaced on the Pro page (share link + counts +
"Pro free until …"). Comp grants are why **every Pro perk gates on
`hasProBenefits`, not bare `isPro`**. Full design:
[ADR 0039](adr/0039-referrals-pro-grants.md).

---

## 6. Tip jar

Optional gratuity flow on every event. Attendees tip the host; **PickupVB
takes no platform fee on tips** — 100% of the tip reaches the host, less
only Stripe's processing fee (ADR 0014 tip-fee amendment, 2026-06-01).

- Constants: [apps/web/src/app/events/[id]/tip-constants.ts](../apps/web/src/app/events/%5Bid%5D/tip-constants.ts) — min $1, max $500.
- Implemented as a separate Stripe Checkout Session (`mode: 'payment'`,
  metadata flags it as a tip). Routed via Connect like ticket sales, but
  with **no `application_fee_amount`** — `tipPlatformFeeCents()` returns 0,
  so the destination charge transfers the full tip to the host.
- Totals are aggregated by a cheap RPC and shown to attendees; hidden
  from the host themselves to keep gratuity decisions independent.

---

## 7. Host broadcasts

Hosts (and co-hosts) can send a one-to-many announcement to every
attendee — fans out to email, push, and in-app notifications.

- Server action: [apps/web/src/app/events/[id]/broadcast-actions.ts](../apps/web/src/app/events/%5Bid%5D/broadcast-actions.ts).
- UI panel: `HostBroadcastPanel` under
  [apps/web/src/app/events/[id]/\_components/](../apps/web/src/app/events/%5Bid%5D/_components/).
- Teams have their own broadcast: [apps/web/src/app/teams/[id]/broadcast-actions.ts](../apps/web/src/app/teams/%5Bid%5D/broadcast-actions.ts).
- Notification delivery happens through the worker — see [integrations.md § Resend](integrations.md#resend) and [§ Web Push (VAPID)](integrations.md#web-push-vapid).

---

## 8. Tournaments & brackets

For tournament-type events the host runs a bracket post-signup.

**Formats** ([packages/domain/src/brackets/enums.ts](../packages/domain/src/brackets/enums.ts)):

- `single_elimination` — bye distribution uses `top_seeds` (highest seeds get round-1 byes vs phantom slots).
- `double_elimination` — winners/losers/final sides.
- `round_robin`.
- `pool_play_playoff`.

**State machine.** `setup` → `active` → `completed`. Matches transition through `pending` / `in_progress` / `completed` / `bye`. Generators live at [packages/domain/src/brackets/generators.ts](../packages/domain/src/brackets/generators.ts).

**Where it lives.**

- Domain: [packages/domain/src/brackets/](../packages/domain/src/brackets/).
- UI: [apps/web/src/app/events/[id]/bracket/](../apps/web/src/app/events/%5Bid%5D/bracket/).
- Standings, match reporting, and advancement happen via the bracket aggregate so invariants (can't report a `pending` match, can't skip rounds, etc.) are guarded in one place.

---

## 9. Teams

Persistent player groups that can sign up for tournaments together and
host their own events.

- Domain aggregate: [packages/domain/src/teams/team.ts](../packages/domain/src/teams/team.ts).
- Public team page with vanity slug: [apps/web/src/app/teams/[id]/](../apps/web/src/app/teams/%5Bid%5D/).
- Members, captain, broadcasts.

---

## 10. Groups (host orgs)

Vanity-handle pages for clubs, leagues, and venues that host events
under a shared identity. A group can have multiple owners/admins/
members and can be added as a co-host on events.

- UI: [apps/web/src/app/groups/](../apps/web/src/app/groups/).
- Membership roles: `owner` / `admin` / `member`.
- Group-hosted events surface on the group page via [apps/web/src/components/group-hosted-events.tsx](../apps/web/src/components/group-hosted-events.tsx).

---

## 11. Player profiles

Public player pages with vanity handles.

- Domain: [packages/domain/src/users/user-profile.ts](../packages/domain/src/users/user-profile.ts).
- UI: [apps/web/src/app/players/[id]/](../apps/web/src/app/players/%5Bid%5D/) (handles `/players/:handle` and `/players/:uuid`).
- Profile fields: display name, home city, primary/secondary/tertiary positions, Pro badge (toggleable via `profiles.show_pro_badge`).
- Friend graph drives `friends_of_host` and `friends_of_attendees` visibility.

---

## 12. Friends

Symmetric friendship for visibility scoping and "people you may know" surfacing.

- UI: [apps/web/src/app/friends/](../apps/web/src/app/friends/).
- Adds/removes go through `UserProfile.addFriend` / `removeFriend` (with self-friend invariant).

---

## 13. Notifications

Single worker, multiple channels.

- **Channels:** email (Resend), push (Web Push/VAPID), in-app.
- **Kinds:** RSVP confirmations, capacity changes, broadcasts, team invites, payment/refund receipts, host payout paid, 24h + 2h reminders.
- **Templates:** [packages/notifications/src/templates.ts](../packages/notifications/src/templates.ts).
- **Worker:** [apps/web/src/app/api/notifications/worker/route.ts](../apps/web/src/app/api/notifications/worker/route.ts) — runs every minute via Vercel Cron.
- **Reminder generator:** [apps/web/src/app/api/notifications/reminders/route.ts](../apps/web/src/app/api/notifications/reminders/route.ts) — runs every 15 minutes.
- **Per-user preferences** under [apps/web/src/app/profile/notifications/](../apps/web/src/app/profile/notifications/).

---

## 14. Receipts & earnings

- **Buyer receipts:** [apps/web/src/app/profile/receipts/](../apps/web/src/app/profile/receipts/) and `/api/receipts/...` for printable PDFs.
- **Host earnings dashboard:** [apps/web/src/app/profile/billing/earnings/](../apps/web/src/app/profile/billing/earnings/) — totals, payouts, refunds, by event.
- **Payout notifications:** `payout.paid` Stripe Connect webhook fires `host.payout.paid` notification.

---

## 15. Anonymous → claimed accounts

Players can RSVP without signing up (Supabase anonymous auth). Later,
they can "claim" the account to upgrade to a permanent login keeping
their RSVP history.

- Flow: [apps/web/src/app/claim/](../apps/web/src/app/claim/).
- The Turnstile gate prevents bot signups (see [integrations.md](integrations.md#cloudflare-turnstile)).
- Routes that require a "real" user (Pro checkout, billing portal,
  etc.) check `is_anonymous` on the JWT, not just `user != null`.

---

## Adding a new business feature

1. If it has invariants, model it in `packages/domain/` first. Pure
   TypeScript — no Next.js or Supabase imports. See
   [packages/domain/README.md](../packages/domain/README.md).
2. Add a command/query handler in `packages/application/` that
   orchestrates ports.
3. Add the infrastructure adapter (Supabase repo) in
   `packages/infrastructure/`.
4. Wire it into [apps/web/src/lib/handlers.ts](../apps/web/src/lib/handlers.ts).
5. Build the route under `apps/web/src/app/` — page as thin
   orchestrator, sub-components under `_components/`, server actions
   co-located. See [AGENTS.md](../AGENTS.md) for the page-composition
   conventions.
6. Throw typed `DomainError` subclasses, not strings.
7. Add a section to this file.
