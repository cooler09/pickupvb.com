# Event data model — pre-launch finalization

_Created: 2026-05-28_

Pre-launch audit of the event + division + registration data model
against the product's three first-class event types — **Open Play**,
**Tournament**, **League** — and the workflows the user has explicitly
named. Sibling to and downstream of:

- [registration-workflow.md](registration-workflow.md) — most recent
  registration findings (Bundles 117–121 closed the multi-division
  cleanup pass).
- [ADR 0006](../adr/0006-event-divisions.md) — event-as-container,
  division-as-bracket.
- [ADR 0007](../adr/0007-team-registration-model.md), [0008](../adr/0008-team-registration-paradigm.md),
  [0016](../adr/0016-per-division-team-registration-mode.md),
  [0017](../adr/0017-walk-in-registrations.md) — team-registration arc.

Pre-launch posture: **destructive migrations are acceptable.** Where a
finding's recommended fix is a column drop, enum rename, or PK change,
write a single migration; do not bother with multi-stage backfill +
deprecate windows. Data loss is acceptable per the user's brief.

## Product requirements (restated)

| Event type     | Frequency       | Roster shape                                                          | Divisions           | Free agents                        | Bracket / schedule                |
| -------------- | --------------- | --------------------------------------------------------------------- | ------------------- | ---------------------------------- | --------------------------------- |
| **Open Play**  | Single day      | Individuals only                                                      | 1 (always)          | N/A                                | None                              |
| **Tournament** | 1–N days        | Teams: partners / pair-draw / full team; walk-ins; host-edited day-of | 1..N                | Per-division pool, host-toggleable | Bracket per division              |
| **League**     | Weekly × season | **Pre-defined rostered teams**                                        | 1..N (skill + type) | Per-division pool, host-toggleable | Season schedule + playoff bracket |

Cross-cutting: the host always retains full control to edit teams /
rosters / schedule on tournaments and leagues. Open Play stays the
simple individual RSVP flow.

## How findings are graded

See [README.md § How findings are graded](README.md#how-findings-are-graded).
P1 = ship-blocking, P2 = next-sprint hardening, P3 = nice-to-have.

---

## Findings

### P1 #1 — `league` is not a first-class `EventType`

[packages/domain/src/events/enums.ts#L177-L181](../../packages/domain/src/events/enums.ts#L177-L181)
defines `EventType = { OpenPlay: 'open_play', Tournament: 'tournament' }`.
The Postgres enum mirrors it ([20260512000000_init.sql#L22](../../supabase/migrations/20260512000000_init.sql#L22)):
`create type event_type as enum ('open_play', 'tournament')`. Generated
types match ([packages/supabase/src/database.types.ts#L3541](../../packages/supabase/src/database.types.ts#L3541)).

Leagues today have nowhere to live in the model. Hosts who want to run
a league are forced to either (a) create one `tournament` row per
match night (fragments the season), or (b) create one `tournament`
that runs months long (defeats every per-event read shape: search,
JSON-LD, bracket, payouts).

**Recommended fix (destructive, pre-launch):**

1. Migration: `alter type event_type add value 'league'` (Postgres
   enum mutation is non-destructive but irreversible — that's fine).
2. Add `EventType.League = 'league'` to the enums file; update the
   re-export in `@pickupvb/types`.
3. `VolleyballEvent` aggregate gains league-specific branches:
   - `assertRegistrationConfigValid()` enforces every league division
     has `teamRegistrationMode = 'roster'` and `teamComposition ≠ 'solo'`
     (leagues are pre-defined rostered teams per the brief).
   - `assertRegistrationConfigValid()` enforces every open-play
     division has `teamRegistrationMode = null` and
     `teamComposition = 'solo'` (today only the create-form gates this;
     no domain invariant — see P2 #4 below).
4. `events.starts_at` / `ends_at` keep their meaning for leagues
   (= season start / playoff end). Per-night scheduling is its own
   table (P1 #2).

This unblocks every downstream league feature; nothing in the table
above lands without it.

### P1 #2 — No season schedule for leagues

`bracket_matches.scheduled_at` ([20260514000400_tournament_brackets.sql#L66](../../supabase/migrations/20260514000400_tournament_brackets.sql#L66))
is the only "when does a match happen" field in the model. It hangs off
`tournament_brackets`, which is one-row-per-division and is built for a
single-elimination / round-robin / pool-play-playoff structure that
resolves in one sitting. A league season is a **sequence of weeks**,
each week is **a slate of matches** across the division, and the season
**terminates in a playoff bracket**. The shape doesn't fit
`tournament_brackets` and shouldn't be shoehorned in.

**Recommended fix (new schema, additive):**

Introduce one new table — `league_schedule_matches` (or
`division_schedule`) — keyed to `event_divisions.id`:

```sql
create table public.league_schedule_matches (
  id              uuid primary key default gen_random_uuid(),
  division_id     uuid not null references public.event_divisions(id) on delete cascade,
  week_number     int  not null check (week_number >= 1),
  scheduled_at    timestamptz not null,
  court_label     text,                            -- "Court 1", "Net 3"
  home_team_id    uuid references public.teams(id) on delete set null,
  away_team_id    uuid references public.teams(id) on delete set null,
  home_score      int  check (home_score is null or home_score >= 0),
  away_score      int  check (away_score is null or away_score >= 0),
  status          text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed', 'forfeit', 'cancelled')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index league_schedule_matches_division_week_idx
  on public.league_schedule_matches (division_id, week_number, scheduled_at);
```

The end-of-season **playoff bracket** reuses the existing
`tournament_brackets` row keyed to the same `division_id`. Both
coexist: regular season is `league_schedule_matches`, playoff is
`tournament_brackets`. The `tournament_brackets.format` enum already
covers the playoff shapes leagues need
(`single_elimination` / `double_elimination`).

Set-by-set scores: leagues are usually match-level (best-of-N sets,
final score), not set-by-set. Keep `home_score` / `away_score` at the
match level. If a league wants set-level detail later, add
`league_match_sets` mirroring `bracket_match_sets`.

Domain side: new aggregate `LeagueSchedule` (one per division), or
fold it into `Division` as a child collection. Recommend a separate
aggregate to avoid bloating `VolleyballEvent` — leagues are
schedule-write-heavy and need an independent invariant surface
(week numbering monotonic, two distinct teams per match, scheduled_at
within event window).

### P1 #3 — `EventType.OpenPlay` invariants not enforced in the aggregate

Per the brief, "Open plays are almost exclusively a single day event
and almost always have a single division. Open plays are always based
on the individual and never based on a team." The schema and UI
mostly comply:

- [new-event-form.tsx#L515-L565](../../apps/web/src/app/events/new/new-event-form.tsx#L515)
  gates `<DivisionsRepeater>` on `EventType.Tournament` — open-play
  events get one default division at handler time.
- `event_divisions.team_composition` defaults to `'solo'`
  ([20260605000100_event_divisions.sql#L60](../../supabase/migrations/20260605000100_event_divisions.sql#L60)).

But **nothing in the aggregate** rejects:

- An open-play event with `divisions.length > 1`.
- An open-play division with `teamComposition !== 'solo'`.
- An open-play division with a non-null `teamRegistrationMode`.

If a caller bypasses the UI (server action, importer, future API),
the model accepts invalid states silently. Add the three checks to
`VolleyballEvent.assertRegistrationConfigValid()` so the boundary
matches the product contract. Cheap. Pre-launch is the right window
because no real data will be wrong yet.

---

### P2 #4 — `team_composition` vocabulary is overloaded for tournaments

User's tournament team shapes: **partners** (doubles), **pair draws**
(sign up as a pair, get drawn into a team-of-N), **full team** (bring
your roster). Today's enum
([packages/domain/src/events/enums.ts#L139-L147](../../packages/domain/src/events/enums.ts#L139-L147)):

```ts
TeamComposition = { Solo, Team, PairDraw, PartnerRequired };
```

`Team` ("full pre-formed team registers") and `PartnerRequired`
("fixed N-person team built at signup time") are functionally
identical at registration time — both mean "captain shows up with
N people, locked in." The only difference is whether the N humans
came pre-bonded (a persistent `Team` row in roster mode) or assembled
at signup (an `EventTeamRegistration` row in ad-hoc mode). That's
already encoded by `teamRegistrationMode` on the division — encoding
it again on `teamComposition` doubles the surface area and confuses
hosts ("which one do I pick?").

**Recommended fix:**

Collapse the enum to the three shapes the user actually named:

```ts
TeamComposition = { Solo, Partners, PairDraw, Team };
//   Solo     — individuals (open-play, league solo is forbidden)
//   Partners — doubles / triples; captain registers a fixed small group
//   PairDraw — sign up as a pair / triple, drawn into a bigger team
//   Team     — full team registration (uses ad_hoc or roster mode)
```

- `Partners` replaces today's `PartnerRequired` (rename only —
  semantics unchanged; `team_size = 2` or `3`).
- `Team` keeps its current meaning ("captain brings N").
- Drop the implicit "partner_required vs team" distinction — it's
  the `teamRegistrationMode` axis already.

Destructive migration: `alter type team_composition rename value 'partner_required' to 'partners'`
(Postgres 14+ supports this), update the matrix in ADR 0012 + ADR
0016, and update the per-division required-composition table.

### P2 #5 — Free-agent host toggle is division-only; OK for tournaments + leagues, but document the omission for open-play

`event_divisions.allow_free_agents` (Bundle 118) gives hosts per-division
control on tournaments. Leagues will inherit the same column for free
(`league` divisions are the same `event_divisions` row shape). Good.

Open-play has no free-agent pool by product design (RSVP is
individual; everyone is effectively their own free agent). The
column on an open-play division is dead. Two options:

1. **Leave as-is** — column defaults to `true`, the UI never renders a
   FA panel for open-play, code path is dead but harmless. Lowest
   churn.
2. **Force `allow_free_agents = false` on open-play divisions** via the
   aggregate invariant added in P1 #3. Cleaner contract, no read-path
   ambiguity if someone goes spelunking in the DB.

Recommend option 2 — pairs with the P1 #3 invariant tightening.

### P2 #6 — `tournament_brackets` naming is wrong once leagues land

The table holds the playoff bracket for a tournament division _and_ will
hold the playoff bracket for a league division (P1 #2). Calling it
`tournament_brackets` is the wrong noun. Pre-launch is the destructive
window — rename now, eat one PR of import churn, never have to
explain it later.

**Recommended fix:**

Migration:

```sql
alter table public.tournament_brackets rename to event_brackets;
-- (cascade: indexes auto-rename; policies + functions need explicit DROP+CREATE
-- because their names embed the old table name)
```

Update every domain / infra / web import in the same PR. Tests catch
the rest.

### P2 #6.5 — Drop denormalized `event_id` from division-scoped tables

Six tables today carry both `event_id` and `division_id` even though
`event_divisions.event_id` is the canonical FK and a division belongs
to exactly one event. Bundle 118's `assert_division_event_consistency()`
BEFORE INSERT/UPDATE trigger
([20260710000000_division_centric_registration.sql#L94-L142](../../supabase/migrations/20260710000000_division_centric_registration.sql#L94-L142))
exists specifically because the schema knows the columns can drift.
Bundle 117's finding **R6 (P3)** flagged the redundancy and deferred
the column drop; pre-launch is the destructive window for the cleanup.

Per-table accounting:

| Table                                                      | `event_id` shape                                     | Cleanup cost                                                                                                                                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event_attendees`                                          | NOT NULL FK (separate from PK)                       | Drop column; rewrite RLS to subquery through `event_divisions`. Sequenced after P1 #3 makes `division_id` NOT NULL on open-play.                                              |
| `event_teams`                                              | **In PK** `(event_id, team_id)`                      | PK migrates to `(division_id, team_id)`; `event_team_payments` composite FK retargets in the same step.                                                                       |
| `event_team_registrations`                                 | NOT NULL FK (separate from PK)                       | Pure column drop; RLS rewrite. Cheapest of the six.                                                                                                                           |
| `event_free_agents`                                        | **In PK** `(event_id, user_id, division_id)`         | PK migrates to `(division_id, user_id)`.                                                                                                                                      |
| `event_team_payments`                                      | **Composite FK** `(event_id, team_id) → event_teams` | FK shape changes for free when `event_teams` PK migrates; no independent column to drop.                                                                                      |
| `tournament_brackets` (a.k.a. `event_brackets` post-P2 #6) | UNIQUE FK + NOT NULL `division_id`                   | Pure column drop; the per-division NOT NULL has been live since [20260605000300_bracket_per_division.sql](../../supabase/migrations/20260605000300_bracket_per_division.sql). |

Once all six land, the four `assert_division_event_consistency`
triggers and the function itself are deleted — there is no consistency
left to assert when there's only one path to the event.

**Costs (real but small):**

- ~20 RLS policies across the six tables rewrite from
  `is_event_host(event_id)` to
  `is_event_host((select event_id from event_divisions where id = NEW.division_id))`.
  `event_divisions` is tiny (typically 1–6 rows per event) and stays
  in PG's shared buffers, so this is one cached PK lookup per policy
  evaluation.
- `events_view`'s `attendee_count` / `team_count` aggregations rewrite
  to join through `event_divisions`. The view already aggregates per
  event, so the extra cost is one-time per event-page load, not
  per-attendee.
- Lose the ability to filter "all rows for event X" with a single
  index seek. The replacement is an index seek on `division_id` joined
  through the divisions table — measurably slower in micro-benchmarks
  but invisible at our scale.

**Recommended fix (split into two bundles):**

**Bundle A — pure column drops, no PK changes.** Low risk, ships
standalone.

1. Drop `event_id` from `event_team_registrations`.
2. Drop `event_id` from `event_brackets` (post-P2 #6 rename).
3. Rewrite the RLS policies on those two tables to subquery through
   `event_divisions`.
4. Drop the corresponding two
   `assert_division_event_consistency` triggers.
5. Domain repos: `attachTeamToDivision` /
   `EventTeamRegistrationRepository` stop passing `event_id`.

**Bundle B — PK reshape.** Sequenced after P1 #3 lands so
`event_attendees.division_id` is universally NOT NULL.

1. `event_teams` PK `(event_id, team_id)` → `(division_id, team_id)`.
2. `event_team_payments` composite FK retargets to the new PK.
3. `event_free_agents` PK `(event_id, user_id, division_id)` →
   `(division_id, user_id)`.
4. `event_attendees`: drop `event_id`, add index on `division_id`.
5. Rewrite the remaining RLS policies + drop the last two triggers.
6. Rewrite `events_view` aggregations to join through
   `event_divisions`.
7. Drop the `assert_division_event_consistency()` function entirely.

**Do not skip past launch.** The cleanup is free of data-migration
ceremony today; after launch it acquires a backfill + dual-write
window + read-cutover sequence that makes it permanently
not-worth-it. The window is now.

### P2 #6.6 — Collapse `event_teams` + `event_team_registrations` into one table

`event_teams` ([20260512000000_init.sql#L132](../../supabase/migrations/20260512000000_init.sql#L132))
and `event_team_registrations` ([20260606000000_team_registration_model.sql#L45](../../supabase/migrations/20260606000000_team_registration_model.sql#L45))

- `event_team_registration_members`
  ([20260606000000_team_registration_model.sql#L86](../../supabase/migrations/20260606000000_team_registration_model.sql#L86))
  are **the same concept with two shapes.** Both represent "a team
  participating in a division, with a captain, a name, a payment row,
  and a member list." The only real difference is whether the team is:

* **a pointer to a persistent `teams` row** (roster mode — `event_teams`), or
* **inline + ad-hoc** (`event_team_registrations`, with members in a
  sidecar that allows unregistered players via `display_name` +
  optional `email`).

ADR 0017's walk-in promotion (Bundle 120) blurred the line further:
walk-ins go into `event_team_registrations` with
`source = 'walk_in'` even though they aren't "ad-hoc captain
assembled at signup time" in any meaningful sense. The host is
acting on behalf of a same-day team. The discriminator already
exists; it just lives only on the ad-hoc table.

Today every read site, every RLS policy, every payment join, and the
team-checkout / walk-in actions all branch on which of the two
tables to read or write. `event_team_payments` carries a composite
FK into `event_teams` only — ad-hoc captain checkouts store payment
state inline on `event_team_registrations`, which means **two
payment-tracking shapes for the same business event** (someone paid
to put a team in a division). Bundle 117 already flagged that the
domain layer needs an `event_id` parameter on the ad-hoc captain-
checkout port because the table lookups don't compose.

**Recommended fix — one table:**

```sql
create table public.event_team_entries (
  id              uuid primary key default uuid_generate_v4(),
  division_id     uuid not null references public.event_divisions(id) on delete cascade,
  captain_id      uuid not null references public.profiles(id) on delete cascade,
  name            text not null check (length(name) between 1 and 80),
  source          text not null check (source in ('roster', 'ad_hoc', 'walk_in')),
  team_id         uuid references public.teams(id) on delete restrict,
  registered_at   timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- A roster entry MUST point at a persistent team; ad-hoc / walk-in
  -- entries MUST NOT.
  constraint event_team_entries_team_matches_source
    check ((source = 'roster') = (team_id is not null))
);

create table public.event_team_entry_members (
  id           uuid primary key default uuid_generate_v4(),
  entry_id     uuid not null references public.event_team_entries(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete set null,
  display_name text check (display_name is null or length(display_name) between 1 and 80),
  email        text check (email is null or length(email) between 3 and 254),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  constraint event_team_entry_members_has_identity
    check (user_id is not null or display_name is not null)
);
```

Behaviour:

- **Roster mode** snapshots `team_members` into `event_team_entry_members`
  at registration time. This is what you want anyway — editing
  `team_members` after registration shouldn't retroactively change
  who's on the roster for an in-progress event.
- **`event_team_payments` retargets** its composite FK to a single-
  column FK on `event_team_entries.id`. The ad-hoc payment columns
  (`payment_status` / `checkout_session_id` / etc. on
  `event_team_registrations`) **move into `event_team_payments`** —
  one payment row per entry, one shape, regardless of source.
- Roster-mode read sites that show "team name / captain / members"
  stop joining through `teams → team_members → profiles` and instead
  read straight from `event_team_entries` + members. The persistent
  `teams` table becomes pure identity ("this is the same recurring
  team across seasons") and stops being on every event read path.

**Why now:** the table merge is destructive — it's a backfill + drop,
not an additive change. Pre-launch is the only window. Post-launch
costs a dual-write period for `event_team_payments` and a read-
cutover for every team-display surface.

**Sequencing:** lands inside P2 #6.5 Bundle B (same destructive
window — both are PK-shape changes on the team side). When merged
with Bundle B the net result is:

- `event_teams`, `event_team_registrations`,
  `event_team_registration_members` → deleted.
- `event_team_entries`, `event_team_entry_members` → new.
- `event_team_payments` → FK retargets to `event_team_entries.id`;
  ad-hoc inline payment columns deleted.
- `assert_division_event_consistency` triggers covering the two old
  team tables → deleted (one fewer table to assert).

### P2 #6.7 — Collapse `event_attendees` + `event_free_agents` into one table

Both tables are the same shape:
`(division_id, user_id, joined_at, notes?)`. The only difference is
the verb — `event_attendees` ([20260512000000_init.sql#L124](../../supabase/migrations/20260512000000_init.sql#L124))
means "I'm playing in this open-play session"; `event_free_agents`
([20260514000200_event_free_agents.sql#L8](../../supabase/migrations/20260514000200_event_free_agents.sql#L8))
means "I want a tournament team to pick me up." Two tables today
means:

- Parallel RLS policy sets (insert / select / delete).
- Parallel host-view joins (the host roster page reads from both
  separately).
- Parallel `enforce_event_capacity` plumbing — capacity only counts
  attendees, but the trigger has to be aware of both tables to avoid
  drift.
- **No mutual-exclusion guarantee.** Nothing prevents a user from
  being both an attendee and a free agent in the same division.
  Today this is meaningless because attendees are open-play and free
  agents are tournament (different `event_type`), but after P1 #1
  League + free-agent toggle work it becomes a real footgun.

**Recommended fix — one table:**

```sql
create table public.event_participants (
  division_id uuid not null references public.event_divisions(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('attendee', 'free_agent')),
  notes       text check (notes is null or char_length(notes) <= 280),
  joined_at   timestamptz not null default now(),
  primary key (division_id, user_id)
);
```

Behaviour:

- PK `(division_id, user_id)` gives mutual exclusion for free — a
  user holds at most one row per division.
- Capacity trigger filters on `role = 'attendee'`.
- RLS gates `role = 'attendee'` inserts on open-play divisions only,
  `role = 'free_agent'` inserts on divisions where the host has
  enabled the free-agent toggle (existing Bundle 118 column).
- Open-play stays "all rows for this division are attendees" — UI
  reads don't change shape, they just filter on `role`.

**Why this is smaller than P2 #6.6:** less code calls each table
today (open-play and tournament-free-agent are separate UI surfaces
that don't cross-read). The win is the mutual-exclusion guarantee
and one fewer table to keep in sync with future migrations.

**Sequencing:** lands inside P2 #6.5 Bundle B for the same reason
P2 #6.6 does — destructive PK reshape on attendees that needs the
pre-launch window. Bundle B's `event_attendees` drop-of-`event_id`
step becomes "rename + reshape into `event_participants`" instead.
`event_free_agents` deletes entirely.

### P2 #7 — League rostered-team invariant overlaps but doesn't equal tournament rostered-team

Both leagues and tournament-roster-mode divisions point at persistent
`teams.id`. The difference is **lifecycle expectations**:

- **Tournament roster:** team is registered once, plays for one
  weekend, payment is one Stripe charge, team can be withdrawn
  individually.
- **League roster:** team is registered once for the season, plays
  weekly for months, payment is one Stripe charge (season fee) or
  recurring (weekly), withdrawal mid-season needs forfeit logic.

The schema doesn't differentiate. `event_team_registrations` (ad-hoc
sidecar) is the wrong home for league teams — league teams are
persistent `teams` rows.

**Recommended fix:**

For pre-launch, **no new aggregate needed**. League teams reuse
`event_teams` (the join row between `events` × `teams` × `divisions`)

- `event_team_payments` (Bundle 4 sidecar). The differences are
  behavioral, not structural:

* Recurring payment is a Stripe-side concern (existing Pro sub
  pattern already covers it). Defer until a host asks for it.
* Mid-season forfeit: add a `forfeited_at timestamptz` column on
  `event_teams` (nullable, default null). Display side renders the
  team as "Forfeited week 5"; schedule generator skips remaining
  matches. Small, additive.

Document in ADR 0008 (or a new ADR 0019) that **`event_team_registrations`
is tournament-ad-hoc only** — never used for leagues.

### P2 #8 — Walk-in support is tournament-only, and that's correct — but the constraint isn't enforced

`event_team_registrations.source ∈ {captain, host, walk_in}` (Bundle
120 / ADR 0017) lets a host add a same-day team. Leagues by product
definition don't have walk-ins (pre-defined teams only). The current
schema allows a `walk_in` row to land against a league division if
that division is in `ad_hoc` mode — which P2 #7's invariant
("leagues require `roster` mode") forbids transitively but not
directly.

**Recommended fix:**

Same place as P1 #3: aggregate-level invariant. Once `EventType.League`
exists and the per-division `team_registration_mode = 'roster'`
invariant is enforced, walk-ins are automatically blocked (RLS on
`event_team_registrations_insert` already checks the division is in
`ad_hoc` mode — see ADR 0016 §3). Add a regression test in
`packages/domain/src/events/volleyball-event.test.ts` to lock it in.

---

### P3 #9 — Legacy `events`-level fields that are now division-only should be deleted from the aggregate constructor surface

`VolleyballEvent` still carries `format`, `gender`, `skillLevel`,
`capacity`, `positionRoster` on the aggregate ([volleyball-event.ts#L255-L273](../../packages/domain/src/events/volleyball-event.ts#L255-L273))
even though the columns were dropped from `events` in
[20260605000500_phase_9d_drop_legacy_events_cols.sql](../../supabase/migrations/20260605000500_phase_9d_drop_legacy_events_cols.sql).
The aggregate fields are populated from the **primary division** on
load, which works but creates a divergence: the aggregate's `format`
is the primary division's format, not the event's (the event has no
format anymore). Anyone reading `event.format` on a multi-division
tournament gets a misleading value.

**Recommended fix (post-launch is fine):**

- Drop `format`, `gender`, `skillLevel`, `capacity`, `positionRoster`
  from the `VolleyballEvent` aggregate's constructor.
- Move callers to read from `event.divisions[0]` (single-division) or
  to enumerate `event.divisions` (multi-division).
- `skill_level` on `events` was already dropped at the SQL layer; the
  domain field is a read-only ghost.

This is P3 because the current state works — it's just a footgun for
the next contributor. Schedule when touching the aggregate next.

### P3 #10 — `tournament_brackets.format` enum is fine as-is for leagues

`format ∈ ('single_elimination', 'double_elimination', 'round_robin', 'pool_play_playoff', 'swiss')`
([20260514000400_tournament_brackets.sql#L20-L26](../../supabase/migrations/20260514000400_tournament_brackets.sql#L20-L26)).
Leagues use this table only for the **playoff** sub-bracket (P1 #2
puts the regular-season matches in a separate table). The playoff
shapes leagues actually run — single/double elimination — are already
covered. No change. Rename note tracked under P2 #6.

### P3 #11 — `events.host_group_id` × payment routing already documented, but call it out for leagues

[AGENTS.md § Pattern 7](../../AGENTS.md) and
[docs/payments.md](../payments.md) already lock in: payments route
through `events.host_id` (a user), never through `host_group_id`.
Leagues are typically run by a club (group). Confirm during league
implementation that the **creating user's Stripe Connect** is the
payee for league fees — same as tournaments. No model change, just a
reminder for the league rollout PR.

### P3 #12 — Document the "open play vs. tournament vs. league" matrix once leagues land

After P1 #1 lands, the per-event-type behavior table at the top of
this file becomes the canonical reference. Reproduce it in
[docs/features.md](../features.md) and update ADR 0006 with the
league row in the data-model section.

---

## Recommended sequencing

1. **P2 #6 rename `tournament_brackets` → `event_brackets`** — one
   destructive migration + one rename PR. Do first so all subsequent
   league work uses the new noun.
2. \*\*P2 #6.5 Bundle A — drop `event_id` from `event_team_registrations`
   - `event_brackets`\*\* — pure column drops, no PK churn. Lands on
     top of P2 #6 so the brackets rename and column drop ship together.
3. **P1 #1 add `EventType.League`** — enum + aggregate scaffolding.
4. **P1 #3 + P2 #5 + P2 #8 invariant tightening** — bundle the
   open-play / league guard rails on top of P1 #1. Makes
   `event_attendees.division_id` universally NOT NULL, which unblocks
   P2 #6.5 Bundle B.
5. **P2 #6.5 Bundle B + P2 #6.6 + P2 #6.7 — destructive table reshape**
   bundled together (same backfill window): PK reshape from
   P2 #6.5 Bundle B; collapse `event_teams` + `event_team_registrations` +
   `event_team_registration_members` → `event_team_entries` +
   `event_team_entry_members` (P2 #6.6); collapse `event_attendees` +
   `event_free_agents` → `event_participants` (P2 #6.7). Retarget
   `event_team_payments` FK. Drop the
   `assert_division_event_consistency` function once done.
6. **P2 #4 collapse `TeamComposition`** — destructive rename, ADR
   updates. Can land in parallel with #1.
7. **P1 #2 league schedule table + aggregate** — biggest piece of new
   surface; do after the schema cleanup settles.
8. **P3 #9 + P3 #12** — opportunistic cleanup post-launch.

## Product answers (2026-05-28)

The three open questions are now resolved. Folding them back into the
findings:

1. **Pair-draws are never a league shape.** Confirms the P2 #7
   invariant as-stated: every league division requires
   `team_registration_mode = 'roster'` and
   `team_composition IN ('partners', 'team')` (post-P2 #4 rename) —
   `pair_draw` is rejected on league divisions by the aggregate.
2. **Leagues may skip the playoff.** Therefore `event_brackets`
   (post-rename) stays **optional per division** — zero or one row.
   The existing schema already permits this
   (`tournament_brackets.event_id` was `unique` not `not null` after
   the per-division migration; the division-side FK is the same).
   Action: when wiring the league UI, expose a "Run a playoff at
   season end?" host toggle that gates whether the bracket-creator
   panel renders for league divisions. No schema change.
3. **Leagues are season-fee upfront only.** No recurring-billing path
   for leagues — Stripe wiring reuses the existing one-shot Checkout
   used by tournament team registration (`team-checkout-actions.ts` +
   `EventTeamPayment` sidecar). The recurring-fee question is closed
   and **dropped from the backlog**; do not build subscription
   plumbing for leagues. Document this in ADR 0008 (or the new
   league ADR — see P2 #7) so the next contributor doesn't
   re-litigate.

## Remediation log

- **2026-05-28 — P2 #6 landed.** Renamed `tournament_brackets` →
  `event_brackets` in
  [20260728000000_rename_tournament_brackets_to_event_brackets.sql](../../supabase/migrations/20260728000000_rename_tournament_brackets_to_event_brackets.sql).
  Pure rename: table, three indexes (`event_idx` / `division_uidx`
  / `division_idx`), three constraints (`pkey` + two FKs), four RLS
  policies, and the `supabase_realtime` publication membership all
  flip to the new name. Code sites updated in lockstep:
  `SupabaseBracketRepository` ([packages/infrastructure/src/supabase-bracket-repository.ts](../../packages/infrastructure/src/supabase-bracket-repository.ts)),
  Realtime channel filter in
  [apps/web/src/app/events/[id]/bracket/\_components/realtime-refresher.tsx](../../apps/web/src/app/events/%5Bid%5D/bracket/_components/realtime-refresher.tsx),
  seed snippet in
  [supabase/snippets/seed-tournament-fixture.sql](../../supabase/snippets/seed-tournament-fixture.sql),
  generated `database.types.ts` keys + FK names. Migration not
  applied locally (Docker daemon off); CI/CD will apply on deploy
  per AGENTS.md. `pnpm typecheck && pnpm lint && pnpm test && pnpm
build` all green.

- **2026-05-29 — P2 #6.5 Bundle A landed.** Dropped the denormalized
  `event_id` column from `event_brackets` and `event_team_registrations`
  in [20260729000000_drop_event_id_from_event_brackets_and_registrations.sql](../../supabase/migrations/20260729000000_drop_event_id_from_event_brackets_and_registrations.sql).
  Both tables now derive `event_id` from `event_divisions.event_id` via
  the existing `division_id` FK. Migration drops the consistency trigger
  on `event_team_registrations` (the remaining three triggers + the
  `assert_division_event_consistency()` function come out in Bundle B
  once `event_attendees.division_id` is universally NOT NULL — P1 #3).
  Seven RLS policies rewritten to subquery through `event_divisions`
  (registrations insert/update/delete, members select/update/delete,
  brackets insert/update/delete). `event_team_registrations_source_idx`
  changed from `(event_id, source)` → `(division_id, source)`; the
  legacy `event_id` supporting indexes on both tables are dropped.
  Code sites updated: `SupabaseEventTeamRegistrationRepository` flattens
  through a nested `event_divisions!inner(event_id)` join in `loadOne`
  and `detachBackingTeamLink`, drops the `event_id` filter from
  `existsForCaptainInDivision`, and drops `event_id` from the save row;
  `SupabaseBracketRepository` does the same flatten on `findById` /
  `findByDivisionId` and drops `event_id` from the upsert payload;
  `loadEligibleTeamsByDivision` + the two cached ad-hoc loaders in
  [apps/web/src/app/events/[id]/\_loaders/load-event-detail.ts](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts)
  and the winner-validation read in
  [apps/web/src/app/events/[id]/record-division-winner-actions.ts](../../apps/web/src/app/events/%5Bid%5D/record-division-winner-actions.ts)
  switched to inner-join filters. Generated `database.types.ts`
  hand-edited to remove the two columns and FK relationships (Docker
  still off locally; CI/CD applies on deploy). Aggregate APIs unchanged
  — `EventTeamRegistration.eventId` and `Bracket.eventId` continue to
  expose the value, just derived at the persistence boundary now.
  `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green.

- **2026-05-29 — P1 #1 scaffolding landed.** Added `'league'` to the
  `event_type` Postgres enum in [20260729000100_add_league_to_event_type.sql](../../supabase/migrations/20260729000100_add_league_to_event_type.sql)
  (single `alter type ... add value if not exists` — irreversible by
  design). Mirrored in the domain enum (`EventType.League = 'league'`),
  the generated `database.types.ts` stub (enum literal + array), the
  `AnalyticsEventType` union, the `event-team-pricing-validation` input
  type, and the `TYPE_LABEL` map. Added the league branch to
  `assertRegistrationConfigValid` in [packages/domain/src/events/volleyball-event.ts](../../packages/domain/src/events/volleyball-event.ts):
  every league division must have `teamRegistrationMode === 'roster'`
  and a non-solo composition; ad-hoc, individual-signup, and solo
  compositions all throw `InvariantViolation`. Four new domain tests
  in [volleyball-event.test.ts](../../packages/domain/src/events/volleyball-event.test.ts)
  cover the happy path + each rejection branch (183 domain tests
  passing). **Scaffolding only** — create form, filters, listings, and
  per-event UI are intentionally NOT wired up; that work depends on
  P1 #2's `league_schedule_matches` table landing first. League events
  can be inserted via the API today but have no host-facing create
  flow. `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all
  green.

- **2026-05-29 — Step 4 (P1 #3 + P2 #5 + P2 #8) landed.** Domain-only
  invariant tightening; no migration needed (`event_attendees.division_id`
  is already universally NOT NULL since
  [20260606000000_team_registration_model.sql](../../supabase/migrations/20260606000000_team_registration_model.sql)).
  `assertRegistrationConfigValid` in
  [packages/domain/src/events/volleyball-event.ts](../../packages/domain/src/events/volleyball-event.ts)
  gained two new guards: (1) open-play events must have at most one
  division (top-level count check, since the per-division loop can't
  express it), and (2) open-play divisions cannot have
  `allow_free_agents = true` (P2 #5 — the field is meaningless when
  every RSVP is already individual). The audit's other P1 #3 rules
  (open-play division must be solo + `teamRegistrationMode = null`)
  remain covered transitively by the existing Rule 1 (forbids non-null
  mode on open-play) and Rule 3 (forbids non-solo composition on
  individual-signup divisions); explicit tests pin both. Default
  open-play division synthesis in
  [packages/application/src/commands/create-event.handler.ts](../../packages/application/src/commands/create-event.handler.ts)
  and the analytics-mapper fixture in
  [event-analytics-mapper.test.ts](../../packages/application/src/analytics/event-analytics-mapper.test.ts)
  now pass `allowFreeAgents: false` so the new invariant doesn't
  reject the default. Six new tests added under
  `'VolleyballEvent open-play invariants (P1 #3 + P2 #5)'` in
  [volleyball-event.test.ts](../../packages/domain/src/events/volleyball-event.test.ts):
  multi-division rejection, non-solo rejection, non-null-mode rejection,
  `allow_free_agents = true` rejection, accepted-shape happy path, and
  a P2 #8 regression locking in that leagues stay incompatible with
  ad-hoc divisions (transitive walk-in block via P1 #1). 189 domain
  tests passing. `pnpm typecheck && pnpm lint && pnpm test && pnpm
build` all green.

- **2026-05-30 — P2 #6.5 Bundle B (Step 5a) landed.** Dropped the
  denormalized `event_id` column from `event_attendees`, `event_teams`,
  `event_free_agents`, and `event_team_payments` in
  [20260730000000_drop_event_id_pk_reshape.sql](../../supabase/migrations/20260730000000_drop_event_id_pk_reshape.sql).
  All four tables now derive the event through `event_divisions.event_id`
  via their existing `division_id` FK. **Destructive pre-launch
  change** — preamble flags the intent. Migration sequence (14 numbered
  sections): drop dependent views first (0); drop `assert_event_*_consistency`
  triggers + `fill_default_division_id()` trigger/function (1); drop
  all RLS policies that read `event_id` (2); backfill + drop
  `event_team_payments.event_id` (renamed to `division_id` keyed on
  `event_teams(division_id, team_id)`) (3); reshape `event_teams.pk`
  from `(event_id, team_id)` → `(division_id, team_id)` (4); recreate
  `event_team_payments` FK + unique constraint pointing at the new
  composite (5); reshape `event_free_agents.pk` to
  `(division_id, user_id)` (6); drop `event_attendees.event_id` +
  recreate the partial unique on `(division_id, user_id)` + the two
  reminder partial indexes keyed on `division_id` (7); rewrite all
  RLS policies via a `event_divisions` subquery / inner-join (8);
  rewrite `enforce_event_capacity()` to lookup the event through the
  inserted row's `division_id` (9); rewrite
  `event_paid_attendee_count(event_id)` to sum across divisions (10);
  rebuild `events_view` to count attendees across divisions (11);
  rebuild `metro_health_weekly` + `host_activity_monthly` materialized
  views (12); index recap comment (13). Critical ordering: the
  `event_team_payments.division_id` backfill must run before
  `event_teams.event_id` is dropped — preamble calls this out.

  **Code sites (~24 updated):** `SupabaseEventRepository.findById` /
  `.getDetail` / `.searchFollowingFeed` use embedded
  `division:event_divisions!inner(event_id)` joins;
  `.save()` preloads `divisionIds` up front and scopes all
  reconciliation reads/deletes via `.in('division_id', divisionIds)`,
  skipping multi-division inserts silently (those paths go through
  dedicated handlers that pass `division_id` explicitly).
  `.attachTeamToDivision()` and `.attachFreeAgentToDivision()`
  upsert by the composite key (`onConflict: 'division_id,team_id'` /
  `'division_id,user_id'`); their `eventId` params are now unused
  (renamed `_eventId`). `SupabaseEventTeamPaymentRepository.save()`
  pre-resolves `division_id` from `(eventId, teamId)` via
  `event_teams` and throws if no row; `hydrate()` recovers `eventId`
  from `row.division.event_id` embedded on the read.
  `SupabaseBracketRepository.listRegisteredTeams` drops the
  `event_id` filter. `SupabaseEventTeamRegistrationRepository`
  drops `event_id` from the insert + flattens via embedded join on
  detach. App-side, `EventPricing` now carries `divisionId`;
  `event-pricing.ts`, `checkout-actions.ts`,
  `manage-payments-actions.ts`, `pricing-lock.ts`,
  `refund-ticket.ts`, `_loaders/load-event-detail.ts`,
  `broadcast-actions.ts`, `edit/actions.ts`,
  `edit/cancel-actions.ts`, `edit/page.tsx`,
  `record-division-winner-actions.ts`,
  `roster-team-checkout-actions.ts`,
  `api/events/[id]/attendees.csv/route.ts`,
  `api/notifications/reminders/route.ts`,
  `api/webhooks/stripe/route.ts`,
  `checkout/cancel/route.ts`, and
  `checkout/success/route.ts` all migrated to either
  (a) `pricing.divisionId` (single-division per-player flows),
  (b) embedded `division:event_divisions!inner(event_id)` join filters,
  (c) preloaded `divisionIds` + `.in('division_id', divisionIds)`,
  or (d) `checkout_session_id` / `payment_intent_id` / surrogate `id`
  for webhook lookups. Browser hook `use-event-attendees.ts`
  pre-fetches the event's `divisionIds` and subscribes with
  `filter: division_id=in.(...)` (Realtime supports the `in`
  operator). Generated `database.types.ts` hand-edited (Docker still
  off locally; CI/CD applies on deploy).

  **Semantic deltas to remember:** (i) the `fill_default_division_id`
  trigger is gone — every insert into `event_attendees` /
  `event_teams` / `event_free_agents` must now pass `division_id`
  explicitly. (ii) `getEventPricing` returns `null` for events with
  no divisions (was permissive before). (iii) `SupabaseEventRepository.save()`
  silently skips child-table inserts when the event has != 1
  division — dedicated handlers cover those paths. (iv) Webhook
  attendee lookups switched from `(event_id, user_id)` to
  `checkout_session_id` (globally unique and already stamped at
  checkout creation) — more robust than the old composite key.

  189 domain + 17 application + 50 web Vitest tests pass.
  `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green.
  Remaining lint warnings (3) are pre-existing
  `react-hooks/set-state-in-effect` flags in scoreboard pages —
  untouched by this bundle.

- **2026-05-30 — P2 #6.6 (Step 5b — thin pass) landed.** Collapsed
  `event_teams` + `event_team_registrations` +
  `event_team_registration_members` into `event_team_entries` +
  `event_team_entry_members` with a unified `source` enum
  (`roster | ad_hoc | walk_in`) in
  [20260731000000_collapse_team_registration_tables.sql](../../supabase/migrations/20260731000000_collapse_team_registration_tables.sql).
  Retargeted `event_team_payments` from the composite
  `(division_id, team_id)` FK onto a single `entry_id` FK (unique).
  Collapsed `event_divisions.winner_team_id` + `winner_team_registration_id`
  into one `winner_entry_id` → `event_team_entries(id)`. Destructive
  pre-launch reshape — all three legacy tables dropped, no dual-write
  window.

  **Boundary translation chosen to keep this a _thin_ pass:** the
  `EventTeamRegistration` aggregate still exposes
  `RegistrationSource = Captain | Host | WalkIn`; the repo lossy-maps
  aggregate `Captain` / `Host` ↔ DB `ad_hoc` so zero call sites
  changed. `event_team_entries.display_name` doubles as the walk-in
  captain name; boundary code reconstructs `captainDisplayName` per
  source. Payment columns moved off entries onto `event_team_payments`
  (1:1 via `entry_id`); the registration repo upserts both rows on
  save and embeds `payment:event_team_payments(...)` on read.

  **Notable workarounds carried over to Step 5b.ii:** (i)
  `attachTeamToDivision` uses select-then-insert because the partial
  unique index on `event_team_entries(division_id, team_id) WHERE
team_id IS NOT NULL AND deleted_at IS NULL` can't be targeted by
  PostgREST `onConflict`. (ii) Bracket reader keeps the
  `source='roster'` filter — ad-hoc bracket inclusion is deferred.
  (iii) The aggregate's `Host` enum variant is now data-equivalent to
  `Captain` and is a candidate for removal once call sites are
  re-audited.

  **Code sites (~10 updated):**
  [packages/infrastructure/src/supabase-event-team-registration-repository.ts](../../packages/infrastructure/src/supabase-event-team-registration-repository.ts)
  rewritten end-to-end (boundary translation, split payment table);
  [packages/infrastructure/src/supabase-event-team-payment-repository.ts](../../packages/infrastructure/src/supabase-event-team-payment-repository.ts)
  rewritten (resolves `entry_id` from `(event_id, team_id)` on save);
  [packages/infrastructure/src/supabase-event-repository.ts](../../packages/infrastructure/src/supabase-event-repository.ts)
  (roster reads + winner-label resolution + reconcile delta +
  `attachTeamToDivision`);
  [packages/infrastructure/src/supabase-bracket-repository.ts](../../packages/infrastructure/src/supabase-bracket-repository.ts)
  (roster filter);
  [apps/web/src/app/teams/[id]/delete-actions.ts](../../apps/web/src/app/teams/%5Bid%5D/delete-actions.ts),
  [apps/web/src/app/events/[id]/record-division-winner-actions.ts](../../apps/web/src/app/events/%5Bid%5D/record-division-winner-actions.ts)
  (writes `winner_entry_id`),
  [apps/web/src/app/events/[id]/roster-team-checkout-actions.ts](../../apps/web/src/app/events/%5Bid%5D/roster-team-checkout-actions.ts),
  [apps/web/src/app/events/[id]/\_loaders/load-event-detail.ts](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts)
  (public + private cached snapshots; eligibility loader; embedded
  payments), and two ad-hoc panel components for the narrowed source
  union.

  All four verify steps green (`pnpm typecheck && pnpm lint && pnpm
test && pnpm build`). Lint warnings unchanged. Migration not applied
  locally (Docker off); CI/CD applies on deploy. Follow-ups captured
  in [journal entry](../journal/2026-05-30-bundle-step-5b.md) and
  tagged **Step 5b.ii**.

- **2026-05-30 — P2 #6.6 (Step 5b.ii — aggregate + boundary cleanup)
  landed.** Three of the four 5b.ii follow-ups (bracket-reader
  promotion stayed deferred):
  1. **`RegistrationSource` collapsed to `Captain | WalkIn` (true
     bijection).** Dropped the `Host` variant from the aggregate
     enum at
     [packages/domain/src/events/event-team-registration.ts](../../packages/domain/src/events/event-team-registration.ts);
     `RegisterTeamHandler` always passes `Captain` (host-proxy
     differentiated locally via `isHostProxy`, no longer leaks into
     the enum). Boundary translation in
     [packages/infrastructure/src/supabase-event-team-registration-repository.ts](../../packages/infrastructure/src/supabase-event-team-registration-repository.ts)
     header tightened from "lossy-map" to bijection.
  2. **`attach_team_to_division` SQL RPC** in
     [20260801000000_attach_team_to_division_rpc.sql](../../supabase/migrations/20260801000000_attach_team_to_division_rpc.sql).
     `SECURITY INVOKER` function does `INSERT … ON CONFLICT … DO
NOTHING` against the partial unique index in one statement.
     [packages/infrastructure/src/supabase-event-repository.ts](../../packages/infrastructure/src/supabase-event-repository.ts)
     `attachTeamToDivision` collapses from select + teams lookup +
     insert (three round-trips) to one `.rpc()` call.
  3. **Synthesized `captain_display_name` field dropped from loader
     projections** in
     [apps/web/src/app/events/[id]/\_loaders/load-event-detail.ts](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts).
     The DB column is unwritten by the registration repo (which
     stores only `display_name`), so the loader was synthesizing
     `r.display_name`; the one consumer (`hostRows[].captain` for
     walk-ins) now reads `r.name` directly.

  All four verify steps green (189 domain + 17 application + 50 web
  tests passing). Hand-patched `attach_team_to_division` into
  `database.types.ts` per the Docker-off convention. **Outstanding
  P3 follow-ups from this slice:** bracket reader still filters
  `source='roster'`; the unused `captain_display_name` DB column +
  check constraint remain on `event_team_entries`; `isHostProxy`'s
  audit fact has no permanent home if we want to keep the
  duplicate-check skip but drop the local variable. Full narrative
  in [journal entry](../journal/2026-05-30-bundle-step-5b-ii.md).

- **2026-05-30 — P2 #6.7 (thin pass with bridge views) landed.**
  Collapsed `event_attendees` + `event_free_agents` into one
  canonical table per the Step 5b shape, in
  [20260802000000_collapse_attendees_free_agents.sql](../../supabase/migrations/20260802000000_collapse_attendees_free_agents.sql):
  1. **New canonical tables.** `event_participants` (surrogate `id`
     PK, `division_id` FK, nullable `user_id`, `role` discriminator
     ∈ `('attendee','free_agent')`, partial unique on
     `(division_id, user_id) WHERE user_id IS NOT NULL`) +
     `event_participant_payments` (1:1 with attendee participants,
     mirrors `event_team_payments` exactly). The partial unique
     index across roles is the **mutual-exclusion guarantee** the
     audit was asking for — a user can no longer be both an
     attendee and a free agent in the same division.
  2. **Bridge views.** `event_attendees` and `event_free_agents`
     recreated as `SECURITY INVOKER` views over the canonical
     tables, with INSTEAD OF INSERT/UPDATE/DELETE triggers that
     route columns to the right backing table. Every existing
     `.from('event_attendees')` / `.from('event_free_agents')` call
     in the app, repo, webhook, reminder cron, CSV export, refund
     flow, manage-payments, broadcast-actions, edit-actions, and
     pricing-lock surfaces keeps working unchanged.
  3. **Capacity trigger rewritten** on `event_participants` with
     `WHEN (NEW.role = 'attendee')` — INSTEAD OF on the bridge
     view fires too late for capacity rejection so it had to land
     on the canonical table.
  4. **RLS posture mirrored** onto `event_participants`: public
     read, own-row insert/delete, host insert/update via
     `is_event_host`, free-agent insert branch keeps the
     `not is_anon_session()` + `allow_free_agents` + tournament +
     published checks. Webhook + admin flows continue via the
     admin client (bypasses RLS).
  5. **Dependent objects rebuilt:** `events_view`,
     `metro_health_weekly`, `host_activity_monthly`,
     `event_paid_attendee_count(uuid)`, and `events_select`
     (friends_of_attendees branch) all rewritten to join through
     `event_participants` with `role='attendee'`.
  6. **Realtime hook updated** —
     [apps/web/src/hooks/use-event-attendees.ts](../../apps/web/src/hooks/use-event-attendees.ts)
     now subscribes to `event_participants` and filters the
     callback by `role === 'attendee'`. Views can't be in the
     `supabase_realtime` publication, so this was the one
     unavoidable client-layer edit.

  Verify chain green (typecheck + lint + 256 tests + build). **P3
  follow-ups deferred:** retarget the ~30 call sites off the bridge
  views to `.from('event_participants')` opportunistically as each
  is touched; eventually drop the bridge views + INSTEAD OF
  triggers once every caller is retargeted; the
  `event_attendees_bridge_update` payment-coalesce sharp edge (a
  bare `.update()` that omits `payment_status` will reset the
  payment row to `'pending'`) — documented in the journal entry
  but not pre-emptively fixed because every current caller sets
  the field explicitly. Full narrative in
  [journal entry](../journal/2026-05-30-bundle-step-6-7.md).

- **2026-05-30 — P1 #2 (thin pass) landed.** Added the
  `league_schedule_matches` table + `LeagueSchedule` domain
  aggregate + repository port + Supabase adapter. Scope explicitly
  limited to schema + domain + repo; application handlers, server
  actions, and host/public UI are deferred.
  1. **Migration**
     [20260803000000_league_schedule_matches.sql](../../supabase/migrations/20260803000000_league_schedule_matches.sql)
     creates `league_schedule_matches` keyed off `event_divisions.id`
     per the audit's recommended shape (week_number, scheduled_at,
     court_label, home/away team ids + scores, status enum
     `('scheduled','in_progress','completed','forfeit','cancelled')`,
     notes, timestamps) with a `distinct_teams` check constraint
     and a `(division_id, week_number, scheduled_at)` composite
     index. RLS mirrors `event_brackets`: public select, host-only
     insert/delete, host-or-match-captain update. Two new SQL
     helpers — `is_event_host_for_division(uuid)` (wraps
     `is_event_host` via the divisions join) and
     `is_league_match_captain(uuid)`. Added to the
     `supabase_realtime` publication so hosts/captains watch the
     schedule live. Additive only — no existing tables touched.

  2. **Domain aggregate**
     [packages/domain/src/leagues/league-schedule.ts](../../packages/domain/src/leagues/league-schedule.ts)
     introduces `LeagueScheduleMatch` (value-shaped entity) and
     `LeagueSchedule` (aggregate root keyed by `DivisionId`,
     one-schedule-per-division). Invariants enforced: `weekNumber`
     ≥ 1, distinct `homeTeamId` / `awayTeamId` when both set,
     non-negative scores, length-bounded `courtLabel` / `notes`,
     and **`scheduledAt` falls inside the parent event's
     `[startsAt, endsAt]` window** (passed in as `EventWindow` at
     create time, skipped at rehydration so re-dated events still
     load). Mutators: `addMatch`, `removeMatch`, `replaceMatch`.
     Strict week-contiguity and per-week team-uniqueness are
     **explicitly deferred** so hosts can stub sparse weeks
     while scheduling.

  3. **Repository port**
     [packages/domain/src/leagues/league-schedule-repository.ts](../../packages/domain/src/leagues/league-schedule-repository.ts)
     defines `LeagueScheduleRepository` with `nextMatchId()`,
     `findByDivisionId()`, and `save()`. Exported from
     [packages/domain/src/index.ts](../../packages/domain/src/index.ts)
     via a new `./leagues/index.js` barrel.

  4. **Supabase adapter**
     [packages/infrastructure/src/supabase-league-schedule-repository.ts](../../packages/infrastructure/src/supabase-league-schedule-repository.ts)
     implements the port. `findByDivisionId` joins
     `event_divisions → events!inner(starts_at, ends_at)` to
     reconstruct the `EventWindow`. `save()` uses the same
     full-replace strategy as `SupabaseBracketRepository.save()`
     (delete-all + reinsert keyed by `division_id`) — the
     aggregate owns the whole match list. **Follow-up:** wrap in
     an RPC for transactional atomicity once the application
     layer needs it.

  5. **Generated types**
     [packages/supabase/src/database.types.ts](../../packages/supabase/src/database.types.ts)
     hand-patched with the new table's `Row` / `Insert` /
     `Update` / `Relationships` block (consistent with the
     existing `event_brackets` shape — Docker is off in this
     environment, so the generated file is kept current
     manually).

  6. **Tests** —
     [packages/domain/src/leagues/league-schedule.test.ts](../../packages/domain/src/leagues/league-schedule.test.ts)
     covers 17 cases: match invariants (week ≥ 1, integer week,
     distinct teams, null-team placeholders, negative scores) +
     aggregate invariants (event-window rejection on both ends,
     duplicate id rejection at construction, `addMatch` /
     `removeMatch` / `replaceMatch` behaviour, `fromPersistence`
     skips window check). Brings the domain suite to **206 tests
     passing**.

  Verify chain green (typecheck + lint + 206 domain + 17
  application + 50 web tests + build). **Deferred (P1 #2
  follow-ups):**
  - Application handlers: `CreateLeagueSchedule`,
    `UpdateLeagueScheduleMatch`, `RecordLeagueMatchResult`.
  - Server actions + host schedule-editor page.
  - Public-facing league schedule view component.
  - RPC for transactional `save` (today's full-replace runs
    delete + insert without a transaction).
  - Strict week-contiguity invariant (1..N no gaps) and per-week
    team-uniqueness, if hosts report scheduling conflicts.
  - Wire the new repo into the composition root
    ([apps/web/src/lib/handlers.ts](../../apps/web/src/lib/handlers.ts))
    once the first application handler needs it.

### 2026-05-30 — P1 #2 follow-up: application handlers ✅

Added four CQRS handlers on top of the `LeagueSchedule` aggregate so the
domain has a typed entry point before any server actions land:

- [packages/application/src/commands/league-schedule.handler.ts](../../packages/application/src/commands/league-schedule.handler.ts)
  — `AddLeagueScheduleMatchHandler`, `UpdateLeagueScheduleMatchHandler`,
  `RemoveLeagueScheduleMatchHandler`, `RecordLeagueMatchResultHandler`.
  Host-only mutators look up the event via `EventRepository.findById`,
  assert `event.type === EventType.League`, assert the division exists,
  and throw `UnauthorizedError` when the requester isn't the host.
  `RecordLeagueMatchResultHandler` follows the
  [bracket convention](../../packages/application/src/commands/bracket.handler.ts)
  and delegates captain-of-either-team authorization to Postgres RLS;
  the application layer validates only the score/state machine.
- [packages/application/src/commands/league-schedule.handler.test.ts](../../packages/application/src/commands/league-schedule.handler.test.ts)
  — 16 Vitest cases covering happy paths, host gating, non-league events,
  unknown divisions/matches, score-preservation on metadata updates, and
  the Completed/Forfeit status whitelist.
- [packages/application/src/index.ts](../../packages/application/src/index.ts)
  — exports the new handler bundle.

Deferred follow-ups (still open):

- Composition-root wiring in
  [apps/web/src/lib/handlers.ts](../../apps/web/src/lib/handlers.ts) —
  the handlers exist but aren't constructed anywhere yet. A server
  action will pull them in when the host UI lands.
- Server actions + host UI for editing the weekly slate.
- Transactional `save()` (RPC) so the delete-then-reinsert path doesn't
  leave a partial slate on failure — current adapter matches the
  bracket adapter's two-step pattern.
- Strict week contiguity + per-week team uniqueness still deferred at
  the aggregate level (see thin-pass entry above).

### 2026-05-30 — P1 #2 follow-up: composition root + server actions + host UI ✅

Wired the league-schedule layer end-to-end and shipped a host page for
managing the weekly slate. Closes the "server actions + host UI" and
"composition-root wiring" follow-ups from the previous entry.

- [apps/web/src/lib/handlers.ts](../../apps/web/src/lib/handlers.ts) —
  added `leagueScheduleRepo` and the four `*LeagueSchedule*` /
  `RecordLeagueMatchResult` handlers.
- [apps/web/src/app/events/[id]/schedule/actions.ts](../../apps/web/src/app/events/[id]/schedule/actions.ts)
  — server actions (`addMatchFromForm`, `updateMatchFromForm`,
  `removeMatch`, `recordResultFromForm`). All four follow the bracket
  flash-param redirect convention (`?notice=…&msg=…`) and the typed
  `DomainError` classification helper.
- [apps/web/src/app/events/[id]/schedule/page.tsx](../../apps/web/src/app/events/[id]/schedule/page.tsx)
  — server component that loads the per-division schedule + roster
  (`repositories.leagueScheduleRepo.findByDivisionId` +
  `repositories.bracketRepo.listRegisteredTeams`), groups matches by
  week, and renders the host forms only when `event.canManage` is true.
- [apps/web/src/app/events/[id]/schedule/\_components/match-row.tsx](../../apps/web/src/app/events/[id]/schedule/_components/match-row.tsx)
  — `AddMatchForm` + `MatchRow` (read-only for guests; expandable host
  panel with metadata edit + record-result + delete).
- [apps/web/src/app/events/[id]/schedule/\_components/labels.ts](../../apps/web/src/app/events/[id]/schedule/_components/labels.ts)
  — shared notice text (mirrors the bracket labels file).
- [apps/web/src/app/events/[id]/page.tsx](../../apps/web/src/app/events/[id]/page.tsx)
  — added a "Schedule" entry-point section for `event.type === 'league'`,
  mirroring the existing tournament "Bracket" section.

Deferred follow-ups (still open):

- Time-zone aware `datetime-local` handling. The host form currently
  treats submitted values as UTC; we should parse them against
  `event.timeZone` and round-trip through the same TZ when echoing
  defaults. Cheap to add once we pick a date lib.
- Transactional `save()` (RPC) so the delete-then-reinsert path doesn't
  leave a partial slate on failure — current adapter matches the
  bracket adapter's two-step pattern.
- Strict week contiguity + per-week team uniqueness at the aggregate
  level.
- Realtime refresh (the migration already adds the table to the
  `supabase_realtime` publication; a `RealtimeRefresher` analogous to
  the bracket page would let captains see their entered scores appear
  on the host's open page).
- Public spectator view (read-only schedule outside the host gate;
  the page is already public-readable but currently bundles the host
  forms in the same file — split if the page grows).

### 2026-05-30 — Step 6 / P2 #4: `TeamComposition` vocabulary cleanup ✅

Renamed the `partner_required` enum value to `partners` everywhere in
one bundle (safe pre-launch — no production data to backfill). The
old name implied a hard requirement that didn't exist; "partners"
matches the host-facing UI label ("Bring partner(s)") and reads
naturally next to `solo` / `team` / `pair_draw`.

- New migration:
  [supabase/migrations/20260804000000_rename_partner_required_to_partners.sql](../../supabase/migrations/20260804000000_rename_partner_required_to_partners.sql)
  — single `alter type team_composition rename value 'partner_required' to 'partners'`.
- Domain: [packages/domain/src/events/enums.ts](../../packages/domain/src/events/enums.ts)
  (`TeamComposition.Partners = 'partners'`), plus call-site updates in
  [division.ts](../../packages/domain/src/events/division.ts) and
  [volleyball-event.ts](../../packages/domain/src/events/volleyball-event.ts)
  (invariant messages now read `team, pair_draw, or partners`).
- Generated DB types: [packages/supabase/src/database.types.ts](../../packages/supabase/src/database.types.ts)
  hand-patched (Docker off locally; regenerate next time a migration
  lands).
- Web call sites (6 files):
  [enum-labels.ts](../../apps/web/src/lib/enum-labels.ts),
  [events/new/actions.ts](../../apps/web/src/app/events/new/actions.ts),
  [events/new/\_components/divisions-repeater.tsx](../../apps/web/src/app/events/new/_components/divisions-repeater.tsx),
  [events/[id]/\_components/host-divisions-manager.tsx](../../apps/web/src/app/events/[id]/_components/host-divisions-manager.tsx),
  [lib/event-team-pricing-validation.ts](../../apps/web/src/lib/event-team-pricing-validation.ts),
  [events/\_components/event-filter-form.tsx](../../apps/web/src/app/events/_components/event-filter-form.tsx).
- ADRs refreshed:
  [0006-event-divisions.md](../adr/0006-event-divisions.md) (2 spots),
  [0012-registration-paradigm-invariants.md](../adr/0012-registration-paradigm-invariants.md)
  (5 spots).
- Intentionally untouched: the original
  [20260605000100_event_divisions.sql](../../supabase/migrations/20260605000100_event_divisions.sql)
  migration (applied migrations are immutable — the rename migration
  supersedes it at runtime) and the historical journal entry that
  introduced the value.
- Verify chain green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

We did **not** also collapse `team` and `partners` into a single
composition: even though the audit body notes both rely on
`team_registration_mode` for the ad-hoc-vs-roster distinction, the
host UI still needs to differentiate "fixed N-slot team" from
"captain + their partner(s)" at the division level — they imply
different default team sizes and different host messaging.

### 2026-05-30 — Step 8 / P3 #9 (minimal): drop `format`/`gender`/`skillLevel` from the `VolleyballEvent` aggregate ✅

Per [P3 #9](#p3-9-volleyballevent-aggregate-still-mirrors-primary-division-fields-as-read-only-ghosts),
removed the three primary-division mirror fields from the aggregate
root. They were already read-only ghosts (the DB columns dropped in
`20260605000500_phase_9d_drop_legacy_events_cols.sql`; the repo
synthesized them from the primary division via
`primaryDivisionFallback`). Files touched:

- [packages/domain/src/events/volleyball-event.ts](../../packages/domain/src/events/volleyball-event.ts)
  — dropped `format`/`gender`/`skillLevel` from `CreateEventProps`,
  the private constructor, `create()`, `fromPersistence()`, and the
  `skillLevel` getter. Removed the aggregate-level
  `assertFormatAllowedForSurface` call (the rule still fires from
  `Division.create` — coverage preserved in `rules.test.ts`).
- [packages/application/src/commands/create-event.handler.ts](../../packages/application/src/commands/create-event.handler.ts)
  — stop forwarding the three fields into `VolleyballEvent.create`.
  The DTO and `divisionFromDto` synthesizer still consume them when
  building the default division.
- [packages/application/src/commands/team.handler.ts](../../packages/application/src/commands/team.handler.ts)
  — deleted the now-redundant `event.format !== team.format` check;
  the division-level format check below it supersedes it.
- [packages/application/src/queries/event-queries.handler.ts](../../packages/application/src/queries/event-queries.handler.ts)
  — `GetEventByIdHandler` now sources `format`/`gender`/`skillLevel`
  from `event.divisions[0]` (converting `skillTier → SkillLevel` via
  `skillTierBand`). The public `/api/events/[id]` shape is preserved.
- [packages/infrastructure/src/supabase-event-repository.ts](../../packages/infrastructure/src/supabase-event-repository.ts)
  — `findById` no longer feeds the three fields into
  `VolleyballEvent.fromPersistence`. `primaryDivisionFallback` stays
  (the `getDetail` read-model path and the aggregate's `capacity`
  fallback still depend on it).
- [packages/domain/src/events/volleyball-event.test.ts](../../packages/domain/src/events/volleyball-event.test.ts)
  and
  [packages/application/src/commands/team.handler.test.ts](../../packages/application/src/commands/team.handler.test.ts)
  — stripped the three keys from every `VolleyballEvent.create({...})`
  block; deleted the `'rejects invalid surface ↔ format combo'` test
  (coverage retained in `rules.test.ts`); rewrote the team-handler
  "format differs from event format" case as a division-format mismatch.

**Scope notes / deferred:**

- `capacity` stays on the aggregate — drives open-play invariants and
  per-team team-capacity enforcement.
- `positionRoster` stays on the aggregate — positional-signup
  persistence is a separate question (no division column yet); to be
  addressed in a follow-up bundle (user direction: "keep positional
  signup for open plays" for now).
- `EventDetailReadModel` (in
  [packages/domain/src/events/event-repository.ts](../../packages/domain/src/events/event-repository.ts))
  still exposes `format`/`gender`/`skillLevel` — it's a read model fed
  directly from the DB by `getDetail`, not from the aggregate. Web
  pages consuming it (`apps/web/src/app/events/[id]/page.tsx`,
  `event-card.tsx`, etc.) are untouched. P3 #9 explicitly scoped to
  the aggregate.

Verify: typecheck / lint / test / build all green. 205 domain tests +
32 application tests + 50 web tests pass.

### 2026-05-30 — Step 8 / P3 #12: per-event-type matrix landed in features.md + ADR 0006 ✅

Per [P3 #12](#p3-12--document-the-open-play-vs-tournament-vs-league-matrix-once-leagues-land),
docs-only bundle:

- [docs/features.md § 1 Event hosting](../features.md#1-event-hosting)
  — refreshed the `EventType` bullet to list all three values
  (`open_play / tournament / league`), added an **Event-type matrix**
  subsection reproducing the audit's product-requirements table, and
  expanded the "Open play vs tournament" paragraph into three bullets
  covering league semantics + the season-fee-upfront-only rule.
- [docs/adr/0006-event-divisions.md](../adr/0006-event-divisions.md)
  — added an **Addendum: 2026-05-30 — League event type** section
  capturing the post-ADR additions: per-division registration shape
  (`roster` + non-solo only), schedule + optional playoff bracket,
  payments routing (one-shot Checkout, no recurring billing,
  `events.host_id` payee), and a data-model summary table for the
  three event types. The addendum cross-references the features
  matrix as the canonical product source.

No code changes. The audit body's "Product requirements" table at
the top of this file remains the canonical reference; features.md
mirrors it for product-doc readers, ADR 0006 cross-references it
for architecture-doc readers.

### 2026-05-30 — P3 #11: league payment routing callout in payments.md ✅

Per [P3 #11](#p3-11--eventshost_group_id--payment-routing-already-documented-but-call-it-out-for-leagues),
docs-only confirmation that leagues follow the same payment-routing
rule as tournaments — payee resolved from `events.host_id`, never
from `host_group_id`. Product decision (verbatim from the user):
"yeah it will be the same as tournaments."

- [docs/payments.md § Payment routing](../payments.md#payment-routing--every-entry-point-goes-through-host_id)
  — added a paragraph below the routing table noting that league
  season-fee checkout reuses `team-checkout-actions.ts` (same
  `event.hostId` → `getHostStripeAccount(hostId)` resolution),
  cross-references this finding and the ADR 0006 addendum, and
  re-states the closed product question (no recurring billing for
  leagues; one-shot Checkout Sessions only).
- The ADR 0006 addendum landed in the previous P3 #12 bundle
  already captures the architectural side (payee routing through
  `events.host_id`, no recurring billing); this entry closes the
  payments-doc cross-reference.

No code changes, no migrations, no schema deltas — confirmation
that the existing routing model carries leagues without
modification.

---

### 2026-05-30 — P2 #7: league rostered-team lifecycle (`forfeited_at`) ✅

Closes P2 #7. Pre-launch posture matches the audit's recommended
fix: small, additive, no new aggregate, no new join table.

**Schema (additive only):**

- [`20260805000000_event_team_entries_forfeited_at.sql`](../../supabase/migrations/20260805000000_event_team_entries_forfeited_at.sql)
  adds a nullable `forfeited_at timestamptz` column on
  `event_team_entries`. No backfill, no index, no RLS change.

**Audit text translation.** The original finding refers to
`event_teams` and `event_team_registrations` — both names from
before the P2 #6.6 collapse
([`20260731000000_collapse_team_registration_tables.sql`](../../supabase/migrations/20260731000000_collapse_team_registration_tables.sql)).
The current shape is one table, `event_team_entries`, with a
`source ∈ {roster, ad_hoc, walk_in}` discriminator. The `source`
to event-type mapping (and the league-only constraint, transitively
enforced by P1 #1's `assertRegistrationConfigValid` league branch)
is now documented in
[ADR 0008's 2026-05-30 addendum](../adr/0008-team-registration-paradigm.md#addendum-2026-05-30--league-rostered-teams),
which subsumes the audit's "Document in ADR 0008 (or a new ADR 0019)
that `event_team_registrations` is tournament-ad-hoc only" item.

**Deferred per audit guidance** ("Defer until a host asks for it"):

- `EventTeamRegistration.forfeitedAt` getter / `forfeit(now)`
  mutator on the aggregate.
- Host action + schedule-render filter consuming the column.
- Repository round-trip mapping (will be added with the domain
  field when a league host needs forfeit UI).

Schema lands now so the column is forward-compatible; no
deprecation window will be needed when the aggregate threads it
through. Generated types in `packages/supabase/src/database.types.ts`
hand-patched to surface the column on Row/Insert/Update.

**Verify:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
green.

With P2 #7 closed, every audit finding either has a remediation log
entry, is documented as a no-change decision (P3 #10), or has its
follow-ups tracked in the dedicated sections above. The audit
backlog is effectively drained pre-launch.

---

## Cross-references

- Registration mechanics: [registration-workflow.md](registration-workflow.md)
- Payments routing: [docs/payments.md](../payments.md)
- Past audits that bear on this surface: [architecture.md](architecture.md),
  [data-lifecycle.md](data-lifecycle.md), [privacy.md](privacy.md).
