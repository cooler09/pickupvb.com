# Personas

Named, detailed personas for PickupVB. Two jobs:

1. **Design lens** — concrete people to walk a screen as, complementing the
   high-level persona model in
   [docs/audits/persona-ux.md § "The persona model"](audits/persona-ux.md).
2. **E2E seed plan** — the source-of-truth for the dev accounts we provision
   and the journeys we automate. Each persona maps to a real account
   (email + env var) and a set of features from [docs/features.md](features.md).

This file is the _cast_; [docs/e2e-test-plan.md](e2e-test-plan.md) is the
_script_. When you add a persona here, you're committing to (eventually) a dev
account and at least one e2e scenario that exercises them.

> **Why named personas and not just roles?** "Free host" tells you a tier;
> "Steve, who manages Mark's events but can't touch billing" tells you an
> authorization boundary, a co-host relationship, and a real click-path. The
> bugs live in the relationships between actors, not in any single role.

---

## How to read this

Every persona has a **snapshot table** with the account config you'd provision
in dev:

| Field       | Meaning                                                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Tier**    | `Free` or `Pro` host subscription (see [features.md § 5](features.md#5-pro-host-subscription)). Players are tier-agnostic. |
| **Stripe**  | Stripe Connect state: `none` / `onboarding` / `charges_enabled`. Gates paid events.                                        |
| **Auth**    | `real` account, `anonymous` (guest), or `admin` (platform flag).                                                           |
| **Email**   | Suggested dev alias. We use the Gmail `+slug` convention — every alias routes to `zacharyjordan82@gmail.com`.              |
| **Env var** | The `TEST_*_EMAIL` var an e2e setup project would read. `(existing)` = already wired.                                      |
| **Maps to** | The current pre-seeded test account this persona reuses, if any.                                                           |

All accounts share `TEST_USER_PASSWORD`. **Never reuse a production user.**

### Reconciling with today's accounts

Six accounts already exist (see [e2e README](../apps/web/tests/e2e/README.md#test-accounts)
and [e2e-test-plan.md § 0](e2e-test-plan.md#0-test-accounts)):
`attendee-a`, `attendee-b`, `free-host`, `pro-host`, `stripe-host`, `admin`.
Each gets adopted by a persona below so we don't double-provision. New personas
get new aliases. The full provisioning list — including group/team membership
the seed needs to set up — is the [Provisioning matrix](#provisioning-matrix)
at the bottom.

---

## Org & team entities

Personas don't exist in isolation — they own, manage, and play under shared
identities. These are the **groups** ([features.md § 10](features.md#10-groups-host-orgs))
and **teams** ([features.md § 9](features.md#9-teams)) the personas hang off.

### Groups (host orgs)

| Group                         | Owner  | Admin(s) | Members           | Purpose                                                                                                                                                  |
| ----------------------------- | ------ | -------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **VB Beach Club**             | Mark   | Steve    | Amy, Adam         | Flagship club. Hosts open plays + tournaments under a shared identity; added as **co-host** on Mark's events. Tests owner vs admin vs member boundaries. |
| **Coastal Volleyball League** | Diana  | —        | rostered captains | League org. Runs a weekly rostered season + season-end playoff bracket.                                                                                  |
| **The Sandbar Courts**        | Carlos | —        | —                 | A **venue** group. Hosts events under the facility's name rather than a person. Lean org with a single owner.                                            |

### Teams (persistent player groups)

| Team              | Captain         | Members              | Used for                                                                                                                                                                                                                               |
| ----------------- | --------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sand Sharks**   | Bianca          | Adam, Priya, Tyler\* | Registers for tournaments + a league division; team broadcasts, roster edits. \*Tyler joins via free-agent pickup.                                                                                                                     |
| **Net Ninjas**    | Adam            | Marcus               | Rival team — gives brackets a real head-to-head (Sand Sharks vs Net Ninjas in a final).                                                                                                                                                |
| **Coastal #1–#4** | (host-rostered) | account-less         | Host-added roster teams in Diana's league — exercises the [host-managed team registration](../apps/web/src/app/events/%5Bid%5D/team-signup-actions.ts) + mark-paid-off-platform flow, where teams have no real accounts until claimed. |

---

## Hosts & organizers

### P1 — Mark Delgado · _the flagship Pro host_

| Tier | Stripe          | Auth | Email                            | Env var               | Maps to    |
| ---- | --------------- | ---- | -------------------------------- | --------------------- | ---------- |
| Pro  | charges_enabled | real | `zacharyjordan82+mark@gmail.com` | `TEST_PRO_HOST_EMAIL` | `pro-host` |

**Backstory.** Mark runs **VB Beach Club** out of Virginia Beach — three sand
courts at the oceanfront and a winter indoor slot in Chesapeake. He's the
organizer everyone copies: clean event pages, sponsor logos, paid tournaments
that actually start on time. He's been Pro since launch and has Stripe Connect
fully onboarded, so he charges for tickets and tournaments and keeps the lower
2.5% platform fee.

**What he does.**

- Creates **paid** open plays and **multi-division tournaments** under the
  VB Beach Club group (adds the group as co-host).
- Uses **Pro-only** features: event templates, the analytics dashboard, CSV
  attendee export, sponsor panel, the Pro badge.
- Runs **brackets** (single + double elimination), records results, advances
  winners.
- Sends **host broadcasts** to attendees; views the **earnings dashboard** and
  payouts.

**E2E scenarios he anchors.** Pro-gated template save/apply, paid-event
creation past the free cap, Stripe checkout fulfillment, bracket result
recording + advancement, sponsor panel render, analytics/earnings pages,
group-as-co-host edit permissions.

**Relationships.** Owns [VB Beach Club](#groups-host-orgs); Steve is his group
admin / co-host; Amy and Adam are members who play his events.

---

### P2 — Julie Tran · _the free host who runs it herself_

| Tier | Stripe          | Auth | Email                             | Env var                | Maps to     |
| ---- | --------------- | ---- | --------------------------------- | ---------------------- | ----------- |
| Free | charges_enabled | real | `zacharyjordan82+julie@gmail.com` | `TEST_FREE_HOST_EMAIL` | `free-host` |

**Backstory.** Julie organizes a Tuesday-night grass open play in Norfolk for
her friend group. No club, no brand — events go out under her own name. She
mostly runs **free** events, but occasionally sells a few tickets for a one-off
tournament, which means she lives right against the **free-tier paid-event cap**
(1 per rolling 30 days).

**What she does.**

- Hosts **free open plays** as an individual (no group, no co-host).
- Occasionally publishes **one paid event** → next one within 30 days is
  **blocked by the free-tier cap** with an "Upgrade to Pro" CTA.
- No access to templates, analytics, CSV export (free tier).
- Uses **positional sign-up** for her indoor nights.

**E2E scenarios she anchors.** Free-host event creation, the free→Pro upgrade
gate on the 2nd paid event in 30 days, the inverse "non-Pro can't save a
template" guard, positional roster, the actionable error CTA
([ErrorActionLink](../apps/web/src/components/error-action-link.tsx)).

**Relationships.** Independent — deliberately _not_ in a group, to keep a clean
"host as self" baseline.

---

### P3 — Steve Park · _the co-host / group manager (not the owner)_

| Tier | Stripe | Auth | Email                             | Env var              | Maps to |
| ---- | ------ | ---- | --------------------------------- | -------------------- | ------- |
| Free | none   | real | `zacharyjordan82+steve@gmail.com` | `TEST_CO_HOST_EMAIL` | _new_   |

**Backstory.** Steve volunteers for Mark. He's an **admin** of VB Beach Club and
a **co-host** on Mark's events, so he edits event details, manages the attendee
roster, and fires broadcasts — but he is **not the group owner** and has **no
Stripe account of his own**. Payments still route to Mark
([features.md § 4](features.md#4-payments--paid-events)); Steve never sees
payout money. He's the persona that proves authorization is scoped correctly.

**What he does.**

- Edits Mark's events and manages attendees **as a co-host**.
- Sends broadcasts on events he co-hosts.
- Manages group membership at the **admin** level, but **cannot** transfer
  ownership, delete the group, or touch billing.
- Cannot open the **earnings/billing** pages for Mark's events (payout is the
  host user's, not the co-host's).

**E2E scenarios he anchors.** Co-host edit/broadcast/attendee-manage
permissions; group admin-vs-owner boundary (members page yes, danger zone no);
the rule that payouts route to `events.host_id`, never a co-host or the group
([AGENTS.md § Pattern 7](../AGENTS.md)).

**Relationships.** Admin of [VB Beach Club](#groups-host-orgs); co-host on P1
Mark's events.

---

### P4 — Diana Wells · _the league organizer_

| Tier | Stripe          | Auth | Email                             | Env var                  | Maps to |
| ---- | --------------- | ---- | --------------------------------- | ------------------------ | ------- |
| Pro  | charges_enabled | real | `zacharyjordan82+diana@gmail.com` | `TEST_LEAGUE_HOST_EMAIL` | _new_   |

**Backstory.** Diana runs the **Coastal Volleyball League** — a weekly rostered
season across two skill divisions (a `bb` rec division and an `a` competitive
one). Teams pay a **season fee upfront** (leagues are one-shot, never recurring
billing). She enters scores week to week, then runs an optional **playoff
bracket** at season's end. Because the app has no public league-create or
team-registration UI yet, Diana also embodies the **host-managed roster**
workflow — she adds account-less teams and marks them paid off-platform.

**What she does.**

- Creates a **league** event with `roster` registration and non-solo
  composition across multiple divisions.
- **Host-adds rostered teams** (Coastal #1–#4), some account-less, and marks
  them paid off-platform.
- Adds weekly **matches** and records scores via the RLS-gated
  `record_league_match_result` RPC.
- Marks a team **forfeited**, then reinstates it.
- Runs the season-end **playoff bracket**.

**E2E scenarios she anchors.** League fixture provisioning (`_helpers/league.ts`),
weekly match result recording, host-only roster management, forfeit/reinstate,
season-fee checkout, host-added + claim flows
([host-managed team registration](../apps/web/src/app/events/%5Bid%5D/team-signup-actions.ts)).

**Relationships.** Owns [Coastal Volleyball League](#groups-host-orgs); Bianca's
and host-rostered teams play in her divisions.

---

### P5 — Sofia Reyes · _the tournament director_

| Tier | Stripe          | Auth | Email                             | Env var                   | Maps to |
| ---- | --------------- | ---- | --------------------------------- | ------------------------- | ------- |
| Pro  | charges_enabled | real | `zacharyjordan82+sofia@gmail.com` | `TEST_TOURNEY_HOST_EMAIL` | _new_   |

**Backstory.** Sofia is a tournament specialist — she doesn't run weekly play,
she runs **big bracket weekends** in Sandbridge: multiple skill divisions,
free-agent pools per division, every bracket format the app supports. Where
Mark is the all-rounder, Sofia exists to stress the **bracket + divisions**
surface end to end.

**What she does.**

- Creates **multi-division tournaments** with **free-agent pools** toggled on.
- Runs each bracket format: **single elim** (with bye distribution),
  **double elim** (winners/losers/final), **round robin**, **pool play →
  playoff**.
- Edits teams and rosters **day-of**, including **walk-in** ad-hoc teams.
- Records match results that advance winners across rounds and resolve a
  champion.

**E2E scenarios she anchors.** Division creation, free-agent signup + captain
pickup, every bracket generator, bye seeding, winner advancement, champion
resolution + reset/revert, the ad-hoc walk-in-team escape hatch used by
`bracket.authed.spec.ts`.

**Relationships.** Hosts solo (no group needed); Adam/Bianca's teams and Tyler
(free agent) sign up for her tournaments.

---

### P6 — Carlos Mendez · _Stripe-onboarded but free tier_

| Tier | Stripe          | Auth | Email                              | Env var                  | Maps to       |
| ---- | --------------- | ---- | ---------------------------------- | ------------------------ | ------------- |
| Free | charges_enabled | real | `zacharyjordan82+carlos@gmail.com` | `TEST_STRIPE_HOST_EMAIL` | `stripe-host` |

**Backstory.** Carlos owns **The Sandbar Courts**, a small facility. He's done
the Stripe Connect onboarding (charges enabled) but hasn't paid for Pro — so he
takes payments at the **5% free-tier fee** and bumps into the **1-paid-event /
30-day** ceiling. He's the persona that isolates "Stripe ready, Pro not" from
Mark's "both."

**What he does.**

- Publishes **paid** events with **buyer-paid** _and_ **host-absorbs** fee
  modes ([event-pricing](../apps/web/src/lib/event-pricing.ts)).
- Hits the **free-tier paid-event cap** and sees the upgrade path.
- Hosts under the **venue group** identity (The Sandbar Courts).
- Sets a **refund window** and processes refunds inside/outside it.

**E2E scenarios he anchors.** Stripe Connect checkout, buyer-paid vs
host-absorbs fee math, 5% vs 2.5% fee assertions (vs Mark), refund-window
gating, venue-as-host display.

**Relationships.** Owns [The Sandbar Courts](#groups-host-orgs); Marcus buys
tickets to his events.

---

### P7 — Nina Okafor · _the host who hasn't connected Stripe_

| Tier | Stripe     | Auth | Email                            | Env var               | Maps to |
| ---- | ---------- | ---- | -------------------------------- | --------------------- | ------- |
| Free | onboarding | real | `zacharyjordan82+nina@gmail.com` | `TEST_NEW_HOST_EMAIL` | _new_   |

**Backstory.** Nina just signed up to host her first event in Suffolk. She's
mid-Stripe-onboarding (account exists, charges **not** enabled yet). When she
tries to publish a **paid** event, the **readiness preflight** stops her and
points her to finish setup. She's the unhappy-path mirror of Carlos.

**What she does.**

- Creates a **free** event successfully.
- Tries to publish a **paid** event → blocked by the **payment-readiness
  preflight** with an actionable "finish Stripe setup" CTA
  ([journal: payment-readiness-preflight](journal/2026-06-03-bundle-event-payment-readiness-preflight.md)).
- Completes onboarding and the same event publishes.

**E2E scenarios she anchors.** The new-event Stripe-readiness gate, the
[ErrorActionLink](../apps/web/src/components/error-action-link.tsx) CTA that's
shown to a **host** (vs. the attendee-facing "host hasn't finished setup" copy,
which carries no CTA — see [AGENTS.md § Pattern 15](../AGENTS.md)).

**Relationships.** Independent first-time host.

---

## Players & attendees

### P8 — Amy Cho · _the casual open-play regular_

| Tier | Stripe | Auth | Email                           | Env var           | Maps to      |
| ---- | ------ | ---- | ------------------------------- | ----------------- | ------------ |
| n/a  | n/a    | real | `zacharyjordan82+amy@gmail.com` | `TEST_USER_EMAIL` | `attendee-a` |

**Backstory.** Amy plays for fun three nights a week. She doesn't host, doesn't
captain — she finds open plays near her in Virginia Beach, RSVPs, and shows up.
She's the **primary authed test user** and the baseline "player / attendee"
persona the suite runs as by default.

**What she does.**

- Uses **near-me** discovery and the events feed.
- **RSVPs / leaves** open plays; lands on the **waitlist** when one's full and
  gets auto-promoted.
- Edits her **profile** (display name, home city, positions, Instagram handle),
  manages **notification preferences**, views **receipts**.
- Follows groups and players; sends a friend request.

**E2E scenarios she anchors.** The default `[authed]` session for almost every
authed spec — RSVP join/leave, profile edit, receipts, follow/unfollow, the
read-only directory browse.

**Relationships.** Member of [VB Beach Club](#groups-host-orgs); friends with
Olivia; plays Mark's, Julie's, and Carlos's events.

---

### P9 — Adam Russo · _the competitive captain_

| Tier | Stripe | Auth | Email                            | Env var                 | Maps to      |
| ---- | ------ | ---- | -------------------------------- | ----------------------- | ------------ |
| n/a  | n/a    | real | `zacharyjordan82+adam@gmail.com` | `TEST_ATTENDEE_B_EMAIL` | `attendee-b` |

**Backstory.** Adam plays `a`/`aa` competitive sand and travels for tournaments.
He captains **Net Ninjas**, plays on **Sand Sharks** when Bianca needs a body,
and registers teams across Sofia's and Mark's brackets. He's the secondary
multi-actor account — the "other side" of invites, follows, head-to-head
matches, and capacity contests.

**What he does.**

- **Registers a team** for tournaments and a league division; pays the team
  entry fee.
- Captains **Net Ninjas**: invites/removes members, sends team broadcasts.
- Plays **bracket matches** that get recorded against him/his team.
- Acts as the **second actor** in cross-account flows (mutual follow, "event is
  full" capacity contest, invite accept/decline).

**E2E scenarios he anchors.** The `attendee-b` cross-context role — capacity
"event is full", group add/promote/remove member, team invite/accept/decline,
mutual-follow friends, the non-host/non-captain **read-only** bracket & league
views.

**Relationships.** Captains [Net Ninjas](#teams-persistent-player-groups); plays
on Sand Sharks; member of VB Beach Club; rival of Bianca's team in finals.

---

### P10 — Bianca Flores · _the team captain_

| Tier | Stripe | Auth | Email                              | Env var              | Maps to |
| ---- | ------ | ---- | ---------------------------------- | -------------------- | ------- |
| n/a  | n/a    | real | `zacharyjordan82+bianca@gmail.com` | `TEST_CAPTAIN_EMAIL` | _new_   |

**Backstory.** Bianca captains the **Sand Sharks**. She's the roster-manager
persona: she builds the team, registers it for tournaments and a league
division, picks up free agents, renames the team, and keeps everyone in the
loop with team broadcasts.

**What she does.**

- Creates and manages the **Sand Sharks** team (vanity slug, roster, captain
  transfer guardrails).
- **Registers the team** for a tournament with an explicit `division_id`
  (multi-division), and into Diana's league.
- **Picks up free agents** (Tyler) into the roster.
- Sends **team broadcasts**; withdraws/re-registers the team.

**E2E scenarios she anchors.** Team creation (`@destructive`), team-signup with
`division_id` ([AGENTS.md § Pattern 6](../AGENTS.md)), free-agent pickup,
roster edit, team broadcast, captain-only authorization on match-result writes.

**Relationships.** Captains [Sand Sharks](#teams-persistent-player-groups)
(Adam, Priya, Tyler); plays Sofia's tournaments + Diana's league.

---

### P11 — Tyler Brooks · _the free agent_

| Tier | Stripe | Auth | Email                             | Env var                 | Maps to |
| ---- | ------ | ---- | --------------------------------- | ----------------------- | ------- |
| n/a  | n/a    | real | `zacharyjordan82+tyler@gmail.com` | `TEST_FREE_AGENT_EMAIL` | _new_   |

**Backstory.** Tyler is new to the area and doesn't have a team yet. He signs up
to the **free-agent pool** for a division so a captain can scoop him up. He's
the persona that proves the free-agent → roster pickup loop works end to end.

**What he does.**

- Registers as a **free agent** in a tournament division's pool.
- Gets **picked up** by Bianca into the Sand Sharks roster.
- Receives the team invite + roster notification.

**E2E scenarios he anchors.** Free-agent signup, captain-initiated pickup, the
per-division free-agent pool toggle, the notification that fires on pickup.

**Relationships.** Joins [Sand Sharks](#teams-persistent-player-groups) via
pickup; signs up for Sofia's tournaments.

---

### P12 — Priya Nair · _the positional player_

| Tier | Stripe | Auth | Email                             | Env var               | Maps to |
| ---- | ------ | ---- | --------------------------------- | --------------------- | ------- |
| n/a  | n/a    | real | `zacharyjordan82+priya@gmail.com` | `TEST_POSITION_EMAIL` | _new_   |

**Backstory.** Priya is a libero who cares which positions are filled before she
commits. She has `libero` set as her primary position, `defensive_specialist`
secondary. She uses the **positional sign-up** on indoor open plays and looks at
the position roster to decide whether a night needs her.

**What she does.**

- RSVPs to a **positional** open play in a specific slot (libero/DS).
- Sees the **position roster** and the over-fill → waitlist behavior for her
  position.
- Relies on her profile **position defaults** to pre-fill the slot.

**E2E scenarios she anchors.** Positional RSVP, position-roster visibility
(`event-attendance.authed.spec.ts` § 5.2), over-fill-to-waitlist per position,
profile position defaults feeding the slot.

**Relationships.** Plays on [Sand Sharks](#teams-persistent-player-groups);
regular at Julie's indoor nights.

---

### P13 — Greg Nolan · _the anonymous guest who claims later_

| Tier | Stripe | Auth                | Email                            | Env var  | Maps to |
| ---- | ------ | ------------------- | -------------------------------- | -------- | ------- |
| n/a  | n/a    | anonymous → claimed | `zacharyjordan82+greg@gmail.com` | _none\*_ | _new_   |

> \*Greg starts with **no account** — he's created at runtime via Supabase
> anonymous auth, then claims into the email above. A persistent dev account
> isn't pre-seeded; the test drives the conversion.

**Backstory.** Greg saw a flyer for a Saturday open play and clicked the link.
He RSVPs **without making an account** (anonymous auth, Turnstile-gated). He
likes it, comes back, and **claims** the account to keep his RSVP history.

**What he does.**

- **Guest-RSVPs** to a public event while signed out (`is_anonymous: true`).
- Hits **claim-gated** walls — actions that require a real account check the
  `is_anonymous` JWT claim, not just `user != null`
  ([features.md § 15](features.md#15-anonymous--claimed-accounts)).
- **Claims** the account via `/claim`; RSVP history is preserved, no dupes.

**E2E scenarios he anchors.** Anonymous RSVP, the Turnstile gate, anon-only
nudges, the `is_anonymous` guard on Pro checkout / billing, the claim flow
preserving history.

**Relationships.** None until claimed — by design a cold-start persona.

---

### P14 — Marcus Lee · _the paid-ticket buyer_

| Tier | Stripe | Auth | Email                              | Env var            | Maps to |
| ---- | ------ | ---- | ---------------------------------- | ------------------ | ------- |
| n/a  | n/a    | real | `zacharyjordan82+marcus@gmail.com` | `TEST_BUYER_EMAIL` | _new_   |

**Backstory.** Marcus is happy to pay to play — he buys tickets to Carlos's and
Mark's paid events, drops a **tip** for a host who ran a great night, and
occasionally needs a **refund** when plans change. He's the money-side player
persona: every Stripe buyer path runs through him.

**What he does.**

- Buys a **ticket** via Stripe Checkout (success + decline `4000…0002` card).
- Leaves a **tip** (0% platform fee — host gets it all less Stripe's cut).
- Requests a **refund** inside the window (auto) and outside it (host-manual).
- Views **buyer receipts** and printable PDFs.

**E2E scenarios he anchors.** Stripe Checkout fulfillment + decline, tip jar
checkout, refund-window auto vs manual, receipts. (Most are `test.fixme`
pending the Stripe test-mode fixture suite — see
[e2e README § "Stripe Checkout / Connect"](../apps/web/tests/e2e/README.md).)

**Relationships.** Buys from Carlos (P6) and Mark (P1); plays on Net Ninjas.

---

### P15 — Hannah Schmidt · _the waitlister_

| Tier | Stripe | Auth | Email                              | Env var               | Maps to |
| ---- | ------ | ---- | ---------------------------------- | --------------------- | ------- |
| n/a  | n/a    | real | `zacharyjordan82+hannah@gmail.com` | `TEST_WAITLIST_EMAIL` | _new_   |

**Backstory.** Hannah's events always seem to fill before she RSVPs. She's the
**capacity / waitlist** persona — she lands on the waitlist, then gets
auto-promoted when someone leaves, and the live spot count has to stay correct
across viewers the whole time.

**What she does.**

- RSVPs to a **full** event → lands on the **waitlist**.
- Gets **auto-promoted** when a confirmed attendee leaves.
- Watches **live spot counts** update (realtime publication) without a refresh.

**E2E scenarios she anchors.** Waitlist landing, auto-promotion on a leave,
realtime spot-count parity across two browser contexts (with Amy/Adam as the
contending attendees).

**Relationships.** Contends for spots against Amy (P8) and Adam (P9) at Mark's
events.

---

### P16 — Olivia Banks · _the social connector (visibility hub)_

| Tier | Stripe | Auth | Email                              | Env var             | Maps to |
| ---- | ------ | ---- | ---------------------------------- | ------------------- | ------- |
| n/a  | n/a    | real | `zacharyjordan82+olivia@gmail.com` | `TEST_SOCIAL_EMAIL` | _new_   |

**Backstory.** Olivia knows everyone. She has the densest **friend graph** in
the test set, which makes her the linchpin for **visibility scoping**: events
set to `friends_of_host` or `friends_of_attendees` should appear for her (or
not) based purely on the friend edges. She's how we prove the visibility enum +
RLS actually gate discovery.

**What she does.**

- Maintains **friends** with Amy, Adam, Mark, and several others.
- Discovers (or is correctly denied) events scoped to `friends_of_host` /
  `friends_of_attendees`.
- Surfaces in "people you may know."

**E2E scenarios she anchors.** `friends_of_host` discovery when she's friends
with the host; `friends_of_attendees` discovery when a friend is attending;
the **negative** case — an unrelated viewer can't find the same event;
friend add/remove + the self-friend invariant.

**Relationships.** Friends with Amy (P8), Adam (P9), Mark (P1) — the friend-edge
center of the graph.

---

## Lifecycle & platform

### P17 — Rachel Kim · _the lapsed Pro host_

| Tier                  | Stripe          | Auth | Email                              | Env var                 | Maps to |
| --------------------- | --------------- | ---- | ---------------------------------- | ----------------------- | ------- |
| Pro → past_due → Free | charges_enabled | real | `zacharyjordan82+rachel@gmail.com` | `TEST_LAPSED_PRO_EMAIL` | _new_   |

**Backstory.** Rachel went Pro for a busy summer, then let the subscription
lapse. She's the **subscription-lifecycle** persona: trial → active → `past_due`
grace → cancelled/Free. The interesting behavior is what happens to her Pro
perks across each state — the `is_pro_host` RPC treats `active` and `trialing`
as Pro and grace-periods `past_due`, so the **boundary conditions** are where
bugs hide.

**What she does.**

- Sits in each subscription state (drive via Stripe `customer.subscription.*`
  webhooks against dev).
- After lapse: paid-event cap **returns** (1/30d), standalone-bracket cap drops
  to **1 active**, Pro badge + templates + CSV export disappear.
- Verifies cancelling a paid event does **not** free a free-tier slot (abuse
  guard).

**E2E scenarios she anchors.** Pro trial/active/past_due/cancelled transitions,
perk gating at each boundary, the standalone-bracket "1 active" downgrade, the
rolling-30d cap re-applying after downgrade.

**Relationships.** Independent — a single-account lifecycle fixture.

---

### P18 — Zoe Carter · _the platform admin_

| Tier | Stripe | Auth  | Email                           | Env var            | Maps to |
| ---- | ------ | ----- | ------------------------------- | ------------------ | ------- |
| n/a  | n/a    | admin | `zacharyjordan82+zoe@gmail.com` | `TEST_ADMIN_EMAIL` | `admin` |

**Backstory.** Zoe has the platform-admin flag. She approves **community-listing
claims**, handles moderation, and can escalate roles. She's the only persona
who sees the `/admin/*` surfaces, and the only one whose reads are allowed to
hit base `public.profiles` PII on already-authorized paths.

**What she does.**

- Reviews and **approves claims** at `/admin/claims` (needs a city+day-matched
  listing + event spanning two players).
- Performs **moderation** / role escalation.
- Cleans up stray e2e fixtures from the admin views.

**E2E scenarios she anchors.** All of `admin.authed.spec.ts` (currently
`test.fixme` — needs the paired listing+event seed described in the
[e2e README § "Multi-actor admin"](../apps/web/tests/e2e/README.md)).

**Relationships.** Acts on listings/claims created by other personas; otherwise
stands apart.

---

## Relationship map

```
                          ┌─────────────────────────────┐
                          │        VB Beach Club         │  (group)
                          │  owner: Mark (P1, Pro+Stripe)│
                          │  admin: Steve (P3, co-host)  │
                          │  members: Amy (P8), Adam (P9)│
                          └───────────────┬──────────────┘
                                          │ added as co-host on
                                          ▼
                              Mark's paid events ◀──────── buys tickets / tips
                                  ▲   ▲   ▲                Marcus (P14)
              waitlists here      │   │   │
              Hannah (P15) ───────┘   │   └───── friends-of-host visibility
                                      │           Olivia (P16) ── friends ── Amy, Adam, Mark
              contends for spots      │
              Amy (P8) ◀────────────┘

   Sofia (P5, tourney director)            Diana (P4, league organizer)
        │ multi-division brackets               │ Coastal Volleyball League (group)
        ▼                                        ▼
   Sand Sharks (capt. Bianca P10) ── plays ── league divisions ── host-rostered
        members: Adam (P9), Priya (P12),        Coastal #1–#4 (account-less,
        Tyler (P11, picked up from free pool)   host-added, mark-paid-off-platform)
        │
        └── rivals ──▶ Net Ninjas (capt. Adam P9, member Marcus P14)

   Carlos (P6, Stripe+free)            Nina (P7, no Stripe)        Julie (P2, free, solo)
        owns The Sandbar Courts        blocked on paid publish     1 paid / 30d cap

   Rachel (P17, lapsed Pro) ── lifecycle fixture     Zoe (P18, admin) ── /admin/*
   Greg (P13, anon → claim) ── cold start
```

---

## E2E scenario coverage matrix

Which persona(s) anchor each major journey. `●` = primary actor, `○` =
secondary/contending actor. Empty = not involved.

| Journey / feature                            | Primary persona(s)             | Secondary                  |
| -------------------------------------------- | ------------------------------ | -------------------------- |
| Sign up / sign in / forgot-password          | any new alias                  |                            |
| Anonymous RSVP → claim                       | Greg (P13) ●                   |                            |
| Open-play RSVP / leave                       | Amy (P8) ●                     | Adam (P9) ○                |
| Positional sign-up + roster                  | Priya (P12) ●                  | Julie (P2, host)           |
| Waitlist landing + auto-promote              | Hannah (P15) ●                 | Amy ○, Adam ○              |
| Free-host free event                         | Julie (P2) ●                   |                            |
| Free-tier paid-event cap (1/30d)             | Julie (P2) ●, Carlos (P6) ●    |                            |
| Stripe-readiness preflight (no Stripe)       | Nina (P7) ●                    |                            |
| Paid ticket checkout (success + decline)     | Marcus (P14) ●                 | Carlos/Mark (hosts)        |
| Tip jar (0% fee)                             | Marcus (P14) ●                 | Mark (P1, host)            |
| Refund window (auto vs manual)               | Marcus (P14) ●                 | Carlos (P6, host)          |
| Buyer-paid vs host-absorbs fee math          | Carlos (P6) ●                  | Marcus (buyer)             |
| Pro fee = 2.5% vs Free 5%                    | Mark (P1) vs Carlos (P6)       |                            |
| Pro templates / analytics / CSV / sponsor    | Mark (P1) ●                    |                            |
| Pro subscription lifecycle + downgrade       | Rachel (P17) ●                 |                            |
| Standalone bracket cap (1 active free)       | Rachel (P17) ●                 | Mark (Pro, unlimited)      |
| Group: owner vs admin vs member              | Mark (P1) / Steve (P3) ●       | Amy/Adam (members)         |
| Co-host edit / broadcast / attendee-manage   | Steve (P3) ●                   | Mark (P1, owner)           |
| Payout routes to host_id (not co-host)       | Steve (P3) ●                   | Mark (P1)                  |
| Team create + roster + broadcast             | Bianca (P10) ●                 | Adam (P9, captain)         |
| Team signup with division_id                 | Bianca (P10) ●                 | Sofia (P5, host)           |
| Free-agent signup → captain pickup           | Tyler (P11) ●                  | Bianca (P10)               |
| Tournament brackets (all formats)            | Sofia (P5) ●                   | Bianca/Adam (teams)        |
| League season + weekly scores + forfeit      | Diana (P4) ●                   | Bianca/host-rostered teams |
| Host-managed (account-less) team + mark-paid | Diana (P4) ●                   |                            |
| Visibility: friends_of_host / \_of_attendees | Olivia (P16) ●                 | Mark/Amy                   |
| Friends add/remove + mutual follow           | Olivia (P16) ●                 | Amy (P8), Adam (P9)        |
| Host broadcasts → email/push/in-app          | Mark (P1) ●                    | attendees                  |
| Notifications (bell, unread, prefs)          | Amy (P8) ●                     |                            |
| Receipts / earnings dashboards               | Marcus (buyer) / Mark (host) ● |                            |
| Admin claim approval / moderation            | Zoe (P18) ●                    | Amy/Adam (subjects)        |

---

## Provisioning matrix

The full list to seed in dev. `(existing)` accounts are already pre-seeded —
adopt them rather than creating duplicates. New rows need an account + the
membership/state set up by the seed.

| #   | Persona | Email alias | Env var                             | Tier     | Stripe          | Auth       | Group / team state to seed                                  |
| --- | ------- | ----------- | ----------------------------------- | -------- | --------------- | ---------- | ----------------------------------------------------------- |
| P1  | Mark    | `+mark`     | `TEST_PRO_HOST_EMAIL` (existing)    | Pro      | charges_enabled | real       | Owns VB Beach Club; group added co-host on his events       |
| P2  | Julie   | `+julie`    | `TEST_FREE_HOST_EMAIL` (existing)   | Free     | charges_enabled | real       | No group (solo host)                                        |
| P3  | Steve   | `+steve`    | `TEST_CO_HOST_EMAIL`                | Free     | none            | real       | Admin of VB Beach Club; co-host on Mark's events            |
| P4  | Diana   | `+diana`    | `TEST_LEAGUE_HOST_EMAIL`            | Pro      | charges_enabled | real       | Owns Coastal Volleyball League; host-rostered Coastal #1–#4 |
| P5  | Sofia   | `+sofia`    | `TEST_TOURNEY_HOST_EMAIL`           | Pro      | charges_enabled | real       | Solo host; multi-division tournaments                       |
| P6  | Carlos  | `+carlos`   | `TEST_STRIPE_HOST_EMAIL` (existing) | Free     | charges_enabled | real       | Owns The Sandbar Courts (venue group)                       |
| P7  | Nina    | `+nina`     | `TEST_NEW_HOST_EMAIL`               | Free     | onboarding      | real       | None; mid-Stripe-onboarding                                 |
| P8  | Amy     | `+amy`      | `TEST_USER_EMAIL` (existing)        | n/a      | n/a             | real       | Member of VB Beach Club; friends w/ Olivia                  |
| P9  | Adam    | `+adam`     | `TEST_ATTENDEE_B_EMAIL` (existing)  | n/a      | n/a             | real       | Captain Net Ninjas; member Sand Sharks + VB Beach Club      |
| P10 | Bianca  | `+bianca`   | `TEST_CAPTAIN_EMAIL`                | n/a      | n/a             | real       | Captain Sand Sharks                                         |
| P11 | Tyler   | `+tyler`    | `TEST_FREE_AGENT_EMAIL`             | n/a      | n/a             | real       | Free agent → picked up to Sand Sharks                       |
| P12 | Priya   | `+priya`    | `TEST_POSITION_EMAIL`               | n/a      | n/a             | real       | Member Sand Sharks; libero primary position                 |
| P13 | Greg    | `+greg`     | _none (runtime anon)_               | n/a      | n/a             | anon→claim | Created at runtime; claims into `+greg`                     |
| P14 | Marcus  | `+marcus`   | `TEST_BUYER_EMAIL`                  | n/a      | n/a             | real       | Member Net Ninjas; buys from Carlos/Mark                    |
| P15 | Hannah  | `+hannah`   | `TEST_WAITLIST_EMAIL`               | n/a      | n/a             | real       | None; contends for full-event spots                         |
| P16 | Olivia  | `+olivia`   | `TEST_SOCIAL_EMAIL`                 | n/a      | n/a             | real       | Friends w/ Amy, Adam, Mark (friend-graph hub)               |
| P17 | Rachel  | `+rachel`   | `TEST_LAPSED_PRO_EMAIL`             | Pro→Free | charges_enabled | real       | Subscription cycled through states                          |
| P18 | Zoe     | `+zoe`      | `TEST_ADMIN_EMAIL` (existing)       | n/a      | n/a             | admin      | Platform-admin flag                                         |

> **Note on `pro-host` vs Mark's Stripe.** The current `pro-host` account may
> not have Stripe Connect onboarded. Mark's persona requires **both** Pro
> _and_ `charges_enabled` — if the existing `pro-host` lacks Stripe, either
> onboard it or keep Mark's Stripe paths on Carlos/`stripe-host` and treat
> `pro-host` as "Pro, fee-tier only." Flagging so the seed reflects reality.

---

## Adding a persona

1. Give them a **name, a one-liner, and a reason to exist** — a relationship or
   an authorization boundary no existing persona covers. If they're a tier/role
   clone of someone above, you don't need them.
2. Fill the **snapshot table** and add a row to the
   [provisioning matrix](#provisioning-matrix) (alias, env var, seed state).
3. Add at least one row to the
   [coverage matrix](#e2e-scenario-coverage-matrix) — the journey they anchor.
4. Wire the dev account + (eventually) an `auth.<role>.setup.ts` project and
   storage path in [`_helpers/paths.ts`](../apps/web/tests/e2e/_helpers/paths.ts),
   following the existing `defineAuthSetup` pattern.
