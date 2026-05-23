# 0013. Team identity, persistence, and competitive history

- **Status:** Proposed (design exploration — pick an option before
  implementation)
- **Date:** 2026-05-24
- **Supersedes / extends:** [ADR 0007](0007-team-registration-model.md),
  [ADR 0008](0008-team-registration-paradigm.md) — specifically the
  two-aggregate decision (`Team` vs. `EventTeamRegistration`) and the
  "ad-hoc teams are throwaway" framing.

## Context

Adult volleyball culture has two coexisting team archetypes:

1. **Persistent league/club teams.** A VLA or VNL roster, a college
   alumni club, a sponsored adult-rec team. These have a stable name,
   continuity across seasons, branding, and players take pride in
   their lineage ("Tuesday night beer-league team, two-time A-pool
   champs").
2. **Pickup tournament teams.** A captain assembles 4–8 people the
   week before a tournament. The "team" exists for one weekend.

The current model (ADR 0008) handles both, but as two **disjoint**
aggregates:

- `Team` is persistent, has a roster, and shows up in roster-mode
  signups.
- `EventTeamRegistration` is event-scoped and disappears the moment
  the event is deleted. Members can be unregistered guests with a
  free-text `display_name`.

That separation is _correct for registration mechanics_ but blocks
three social/competitive features the product wants:

1. **Profile "teams" section.** A player should see every team they
   have ever played on — Tuesday beer league, the one-off doubles
   tournament with a friend, the VLA squad — in one list on their
   profile. Today, ad-hoc registrations don't surface anywhere outside
   the event detail page.
2. **Team profile pages with history.** A team's `/teams/<slug>` page
   should show recent events played, results, championships,
   season-over-season continuity. Today, only persistent `teams` rows
   could power this, and we have no result-tracking anywhere.
3. **Competitive resume / achievements.** "2× A-pool champion at
   Spring Slam", "Top-4 at VLA Mid-Atlantic Open". Both for players
   ("my resume") and for teams ("our trophy case"). Requires:
   - A persistent identifier for the team that earned the placement.
   - A persistent record of the placement itself.
   - A way to attribute the placement to the player(s).

The throwaway nature of `EventTeamRegistration` is the load-bearing
wall in the way. Everything else (results entry, profile rollups,
team pages) is additive.

## Goals

- Every team a player has been on — persistent or ad-hoc — is
  reachable from their profile.
- Every team that ever played in a tournament has a stable URL and a
  history page.
- A player's competitive history is a first-class object, suitable
  for a profile "resume" section.
- Hosts can record final placements per division without bespoke
  infrastructure per tournament.
- We don't break the captain-pays / single-mode-per-event invariants
  set in ADR 0008 and ADR 0012.
- We don't push complexity onto hosts running casual leagues
  (Tuesday-night rec doesn't need bracket entry).

## Non-goals (for the first slice)

- ELO / skill rating per player.
- Live bracket running / scorekeeping. Results entry is post-hoc.
- Team-vs-team head-to-head records (derives later from results).
- Cross-platform imports (USAV roster sync, etc.).
- Team chat, photos, social feed.

## The shape of the problem

Two related but separable questions:

- **Q1: Identity.** When an ad-hoc captain types a team name into the
  signup form, does that produce a persistent `teams` row, a row in a
  new `team_appearances` table, or stay event-scoped as today?
- **Q2: History.** Where do final placements live (event-side?
  team-side? a join?), and how do they attribute to players?

The answer to Q1 mostly determines Q2.

## Options — Identity (Q1)

### Option A — Status quo (no change)

Keep `Team` and `EventTeamRegistration` separate. Add profile/history
features only for persistent `Team`s.

- **Pros:** No migration. Existing invariants intact. Cheapest.
- **Cons:** Ad-hoc teams remain invisible on profiles. The "two-time
  beer-league champs" use case is impossible unless that team was
  registered roster-style — which contradicts ADR 0012's rule that
  open-play is individual-only. Most casual tournaments will keep
  using ad-hoc, so the history feature would only apply to a minority
  of teams.
- **Verdict:** Rejected — the social/resume goal is the entire
  product motivation. Status quo undercuts it.

### Option B — Auto-promote every ad-hoc registration to a `teams` row

When a captain submits an ad-hoc signup, also `INSERT INTO teams`
(captain as captain, members as `team_members` rows, guests still
sit on the registration row as `display_name`). The `event_team_registrations`
row gains `team_id` so the registration "points back" at the
persistent team. Captain can rename later, claim guests later, etc.

- **Pros:** Single source of team identity (`teams.id`). Profile and
  history features collapse to one query path. The captain's "I just
  threw a team together" produces a real, navigable team page
  immediately. Free-agent guests can later claim the membership when
  they sign up.
- **Cons:**
  - The captain didn't ask for a team. We'd be creating one
    silently each time, which (a) clutters their profile with one-off
    teams ("Saturday night 6s 5/13/26"), and (b) makes
    captain-leaves-team a complicated lifecycle question that didn't
    exist before.
  - The ad-hoc aggregate stops being throwaway, undoing ADR 0008's
    explicit "two aggregates, no shared base" position. Cascade
    deletion semantics get muddier.
  - Guests-without-accounts can't be `team_members.user_id` (FK
    required), so we still keep the bifurcated member model —
    promotion only helps the captain + signed-in members.

### Option C — Captain opts in: "save this team for next time"

Same as B mechanically (one persistent `teams` row created), but
gated by a checkbox at signup time ("Save this team to my profile").
Default off for ad-hoc unless captain chose roster mode (in which
case the team already exists).

- **Pros:** Captain controls clutter. Beer-league captains save once
  and re-use; truly one-off pickup teams stay disposable. Lifecycle
  rules from ADR 0008 hold for the un-saved case.
- **Cons:** Two paths to maintain (saved vs. un-saved ad-hoc). Saved
  teams need to handle "the same five people played a tournament
  under this name again next month" — do we auto-re-use? Confirm?
  Most captains will probably not check the box, so the history
  feature still applies to a minority.

### Option D — Team "appearance" model (recommended)

Introduce a new aggregate, `EventTeamAppearance`, that sits between
`Event` and either `Team` or `EventTeamRegistration`. Every team that
plays in an event (ad-hoc or roster) gets exactly one appearance row.
The appearance is the durable, queryable identity for history;
`Team` remains the persistent _captain-owned_ object.

Concretely:

```
event_team_appearances
  id                uuid PK
  event_id          uuid not null  -> events
  division_id       uuid not null  -> event_divisions
  team_id           uuid null      -> teams           (set if roster mode OR captain saved)
  registration_id   uuid null      -> event_team_registrations (set if ad-hoc)
  display_name      text not null   (denormalized snapshot — survives if team renamed or deleted)
  captain_id        uuid null      -> profiles
  finished_at       timestamptz null
  placement         int null        (1 = 1st, 2 = 2nd, …)
  placement_label   text null       ("A-pool champion", "Silver bracket 3rd")
  created_at        timestamptz
  CHECK (team_id is not null OR registration_id is not null)
```

History queries hit `event_team_appearances` directly:

- Player profile "teams played on" → join `event_team_appearances`
  through `event_team_registration_members` + `team_members` on
  `user_id`.
- Team profile history → `where team_id = ?`.
- Resume placements → `where placement <= N and (player on the
appearance)`.

- **Pros:**
  - **Doesn't break ADR 0008.** `Team` and `EventTeamRegistration`
    keep their existing semantics and lifecycles. Appearance is a
    new, narrowly-scoped aggregate.
  - **Snapshot semantics.** `display_name` is captured at the time
    of the event; if a team renames later, history reads the historical
    name. Same for captain.
  - **Decouples identity from history.** Whether a team is "persistent"
    is orthogonal to whether it played in an event. Option C can
    still be added on top (captain saves an ad-hoc team → `team_id`
    backfilled on the appearance).
  - **Single read path** for profile/team history regardless of
    ad-hoc vs. roster origin.
  - **Result entry has an obvious home** (placement columns on the
    appearance row, populated post-event).
- **Cons:**
  - Three tables now touch a team-in-an-event (`event_teams`,
    `event_team_registrations`, `event_team_appearances`). The
    appearance row is mostly redundant with the first two _until_ a
    result is recorded; we have to keep them in sync.
  - Slight risk of drift between `team.name` and the snapshot
    `display_name`. Mitigated by snapshotting at appearance creation
    and never updating except by intent.

## Options — History (Q2)

Given Option D for identity, history reduces to two sub-questions.

### Q2a — Where do results live?

- **D1 (recommended):** On the `event_team_appearances` row. Hosts
  enter placements after the event; `placement` + `placement_label`
  populated. Aggregations roll up by `team_id` (or by
  `registration_id` for un-saved ad-hoc) and by player via
  membership.
- **D2:** Separate `event_results` table. Adds a join for no
  benefit — placements are 1:1 with appearances.
- **D3:** Bracket-runner aggregate. Out of scope for the first slice;
  D1 is forward-compatible.

### Q2b — How do players claim appearances?

Three states matter:

- Player was a `user_id` member on the appearance → automatic
  attribution (no claim needed).
- Player was a `display_name`-only guest → needs to claim. Captain
  can convert the guest slot into a `user_id` after the fact (already
  half-supported via `EventTeamRegistration` member edit).
- Player was on a persistent team's roster at event time but is no
  longer → roster snapshot at appearance time (extra join table
  `event_team_appearance_members` mirrors current membership). Future
  work; not blocking first slice.

For the first slice: attribution = "any current member of the
team/registration the appearance points at, at query time".
Acceptable lossy behaviour; a snapshot join can be added later
without breaking the API.

## Recommendation

- **Identity:** **Option D** (new `event_team_appearance` aggregate).
- **History:** **D1** (placement columns on the appearance row).
- **Identity-promotion path:** keep **Option C** as a follow-up — a
  "save this team" checkbox lets ad-hoc captains opt their lineup
  into the persistent-team UX (showing in roster-mode signups, having
  a team page, etc.). Until they opt in, the appearance still exists
  and still surfaces on member profiles, just without a clickable
  team page.

This minimises domain churn (the two existing aggregates keep their
invariants), gives every team-in-an-event a stable identity, and
lands result tracking with a natural home.

## Consequences

- New migration: `event_team_appearances` table with FK to
  `events`, `event_divisions`, and nullable FKs to `teams` /
  `event_team_registrations`.
- New domain aggregate `EventTeamAppearance` under
  `packages/domain/src/events/`. Invariants:
  - Exactly one of `team_id` / `registration_id` is set at creation.
  - `placement` only writable after `finished_at` is set.
  - `display_name` is immutable after creation (snapshot).
- New application handlers:
  - `RecordEventAppearanceHandler` — host triggers (or auto-created
    when the event publishes its rostered teams).
  - `EnterEventResultsHandler` — host enters placements per division.
- Read model additions:
  - `getTeamAppearances(teamId)` / `getRegistrationAppearance(registrationId)`
  - `getProfileTeamHistory(userId)` — union over team membership and
    registration membership, joined to appearances.
- UI:
  - Profile page: new "Teams" + "Highlights" sections fed by the
    read model.
  - Team page (`/teams/<slug>`): history list with placements.
  - Host tool: "Enter results" form after `event.endsAt`.
- No change to checkout, payment, or registration flows. Captain pays
  still applies (ADR 0012); appearance is a passive record.

## What is NOT decided here

- Whether the captain's "save this team" flow is a checkbox at signup
  or a button on the post-event appearance page. The latter avoids
  the "ask before you know you wanted it" problem.
- Whether team profiles are public by default, or opt-in. Likely
  public for any team that has at least one finished appearance.
- Whether free agents (individual signups) get appearances. They
  could, with a separate `event_individual_appearances` table — out
  of scope for the team slice.
- Whether we model recurring leagues (a single "season" with many
  events that aggregate into one championship) at this layer. The
  appearance model is league-friendly but doesn't enforce a season
  concept yet.
- How player-claimed achievements interact with team-claimed
  achievements when the team is later renamed or deleted. Snapshot
  `display_name` covers the basics; richer cases deferred.

## Open follow-ups (once this ADR is accepted)

1. Migration + domain aggregate + repository port.
2. Result-entry UI for hosts (after `event.endsAt`).
3. Profile-page "Teams" + "Highlights" sections.
4. `/teams/<slug>` page wired to history.
5. Decide on save-this-team UX (signup checkbox vs. post-event
   prompt).
6. Free-agent / individual appearances (deferred until team slice
   ships).
