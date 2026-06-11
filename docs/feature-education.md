# User onboarding & feature education

Ideas for helping **new players and new hosts** discover and learn the
product. This is a brainstorm / idea backlog, not a committed spec — entries
graduate into ADRs and journal entries as they get built.

> **Shipped:** **B1 + B2 (gamified checklists)** — Phase 1, 2026-06-04.
> Computed player + host checklists on the profile hub (no per-step badge, no
> migration). See [ADR 0035](adr/0035-onboarding-checklists.md) +
> [journal 2026-06-04](journal/2026-06-04-bundle-onboarding-checklists.md). The
> instrumentation half (**M1**) is the deferred Phase 2.

> **Scope:** **end-user** onboarding inside the app. (For the _contributor_
> day-1 guide — `git clone` → first PR — see [docs/onboarding.md](onboarding.md).)
>
> Related: [docs/personas.md](personas.md) (who the users are),
> [docs/features.md](features.md) (what there is to teach),
> [docs/audits/persona-ux.md](audits/persona-ux.md) (the persona/UX model).

---

## The frame: two cold-start problems

PickupVB has **two distinct onboarding problems**, and they need different
solutions. Teaching both with one mechanism over-explains to players and
under-supports hosts.

|                     | New player                                                       | New host                                                                                  |
| ------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Job**             | Find a game and show up                                          | Run an event and get paid                                                                 |
| **"Aha" moment**    | Signed up → found a nearby event → RSVP'd → it's on my calendar  | Created event → divisions set → Stripe connected → published → first registration         |
| **Time-to-value**   | Minutes                                                          | Long, multi-step, full of cliffs                                                          |
| **Failure modes**   | Bounces before finding a reason to stay                          | Silent walls (Stripe not finished = can't take money; no divisions = registration breaks) |
| **Discovery order** | Teams, brackets, chat, badges come _later_, after they're hooked | Must understand the full lifecycle before publishing confidently                          |

Treat them as **two tracks**.

---

## Idea backlog

Grouped by effort. IDs are stable so we can reference them in ADRs / journal
entries as they ship.

### Lightweight, in-context (cheapest, broadest reach)

These live in pages users already hit — no tour engine required.

- **E1 — Make every empty state a teacher.** "No events yet," "You haven't
  joined a group," host dashboard with zero events. Replace blank/sad empty
  states with a one-line _why_ + a single primary CTA + a short "here's what
  this unlocks." Reuse the existing CTA vocabulary
  (`primaryButtonClass`, etc.) so they stay on-brand. ✅ **Shipped 2026-06-04**
  ([journal](journal/2026-06-04-bundle-onboarding-e1-empty-states.md)). Added a
  shared `EmptyState` primitive (`components/empty-state.tsx`); the audit found
  most directories already taught, so the fixes landed on `/messages` + `/players`
  (were CTA-less) and consolidated `/groups` + `/teams` onto it. `/events` keeps
  its richer bespoke one.
- **E2 — Contextual hint popovers** on genuinely non-obvious controls
  (divisions, ad-hoc vs. roster teams, capacity, anonymous-vs-real-account).
  Use a Radix Popover to match the existing headless-primitive strategy and
  stay accessible.
- **E3 — First-run dismissible banners.** Reuse the existing flash-param /
  banner pattern: a "👋 New here? Here's how RSVP works" banner on first event
  view is nearly free.

### Guided / interactive (medium effort)

- **G1 — Scoped product tours.** A spotlight tour (driver.js / Shepherd-style)
  triggered the first time someone lands on a complex page (host event editor,
  bracket setup). Keep them short (3–5 steps) and skippable — long tours get
  dismissed.
- **G2 — Sandbox demo event.** A pre-seeded demo event/bracket a new host can
  poke at without fear of breaking a real one. Lets them feel the
  bracket/scoring flow before running a live tournament.

### Leverage the gamification system we already have ⭐

The badges/achievements aggregate (ADR 0031) already exists — onboarding
checklists piggyback on it instead of adding a new system. **Highest leverage.**

- **B1 — "Getting Started" checklist (player track).** ✅ **Phase 1 shipped
  2026-06-04** (ADR 0035). _Complete your profile · Join your first event · Join a
  group · Send your first message._ Built as a **computed** checklist (pure rules
  over a snapshot, the badge pattern) rather than dripping out a collector badge
  per step — the trophy case stays athletic (ADR 0031 tone). Required steps gate
  visibility; group/message are optional nudges. Funnel instrumentation is the
  deferred M1.
- **B2 — "Host Setup" checklist (host track).** ✅ **Phase 1 shipped 2026-06-04**
  (ADR 0035). Shipped steps: _Create your first event · Publish it · [optional]
  Connect Stripe._ Intent-gated (only shows for would-be hosts). The "Add
  divisions / Invite players / first registration" payoff steps fold into Phase 2
  (they need the cross-join count an RPC gives cheaply).

### Host-specific scaffolding (the hard track)

- **H1 — Progressive disclosure in the event editor.** Don't show
  bracket/league/payment config until it's relevant. Shrinks the wall of
  options a first-time host faces.
- **H2 — Pre-publish readiness check.** Before "Publish": Stripe ready?
  divisions set? capacity sensible? Catches the silent failure modes the audits
  keep flagging _and_ teaches the host what matters.
- **H3 — "What happens next" preview.** After publish, show the host the
  registration → roster → bracket → payout arc so they understand the lifecycle
  they just entered.

### Content & social (outside the product)

- **C1 — Short looping GIFs/videos** (10–15s, no audio) embedded at decision
  points. Far higher completion than docs.
- **C2 — A `/help` or `/how-it-works` route** with role-segmented guides
  (Player / Host), reusing existing page-composition conventions. ✅ **Both tracks
  shipped 2026-06-11**
  ([host journal](journal/2026-06-11-bundle-host-help-guides.md),
  [player journal](journal/2026-06-11-bundle-player-help-guides.md)). New `/help`
  hub with audience-grouped cards, mirroring the legal-section pattern
  (`help-meta.ts` SSOT + prose `GuidePage` wrapper). **Host (5):** host your first
  event · get paid · tournaments · leagues · event day. **Player (4):** find and
  join · pay for an event · play on a team · your account. Linked from the footer,
  the `/host` zero-state, and the host onboarding checklist; all in the sitemap.
  Host guides link to `/pricing` rather than restating rates so copy can't drift;
  the footer CTA keys off the guide's audience (Host an event vs. Browse events).
- **C3 — Seed-the-network nudges.** "Invite a friend to your event" surfaces
  the social loop early — both growth _and_ the fastest way a new user
  understands the product (they learn by doing it with someone).

### Measurement (do not skip)

- **M1 — Instrument the first-win funnel** per persona via PostHog:
  _signup → first RSVP_ (player) and _host signup → first publish_ (host).
  Without it we're guessing which step leaks. Badge/checklist completion events
  (B1/B2) double as funnel markers. ✅ **Shipped 2026-06-04** (ADR 0035 Phase 2,
  [journal](journal/2026-06-04-bundle-onboarding-m1-funnel.md)). The two first-win
  funnels already fire via `event_joined` / `event_published`; `connect-stripe`
  via `host_payout_setup_completed`; a new `onboarding_step_completed` event
  covers the two remaining steps (`complete-profile`, `create-event`). DB-free —
  no RPC needed (the persisted-state path stays deferred for a future "1 step
  away" nudge).

---

## Recommended starting point

1. **B1 + B2 (gamified checklists)** — most leverage: reuse the badges system,
   cover both personas, and create the measurement hooks in one move.
2. **E1 (empty-state teaching)** — the cheap companion that covers the surfaces
   the checklists point to.
3. **M1 (funnel instrumentation)** — stand it up alongside B1/B2 so we can tell
   whether any of this is working.

---

## Open questions / next steps

- **Audit the current new-user / new-host flows** in `apps/web` to map exactly
  where people hit walls today, grounding all of the above in what exists.
- **Inventory every empty state** so we know the full surface area for E1.
- **Spec the onboarding-checklist feature** (B1/B2) as an ADR describing how it
  hangs off the existing badges aggregate.
