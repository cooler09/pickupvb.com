# 2026-05-30 — Bundle: P1 #2 (league schedule table + LeagueSchedule aggregate)

**Audit item:** P1 #2 from
[docs/audits/event-data-model.md](../audits/event-data-model.md).

## What shipped

A schema + domain + repo bundle scaffolding leagues' per-division
weekly schedule. **No application handlers, server actions, or UI** —
that wiring lands as follow-ups so this bundle stays reviewable.

### Migration

[supabase/migrations/20260803000000_league_schedule_matches.sql](../../supabase/migrations/20260803000000_league_schedule_matches.sql)
creates `public.league_schedule_matches` keyed off
`event_divisions.id`:

```
id uuid pk, division_id uuid not null fk → event_divisions on delete cascade,
week_number int check ≥ 1, scheduled_at timestamptz not null, court_label text,
home_team_id / away_team_id uuid fk → teams on delete set null,
home_score / away_score int check ≥ 0,
status text check in ('scheduled','in_progress','completed','forfeit','cancelled'),
notes text, created_at / updated_at timestamptz,
check (home_team_id is null or away_team_id is null or home_team_id <> away_team_id)
```

Composite index `(division_id, week_number, scheduled_at)` for the
"give me the schedule" read; secondary indexes on `home_team_id` /
`away_team_id` for "show this team's upcoming games."

RLS posture mirrors `event_brackets`: public select, host-only
insert/delete, host **or match captain** update. Two new SQL helpers
support the policy:

- `is_event_host_for_division(uuid)` — wraps the existing
  `is_event_host(p_event_id)` by joining through `event_divisions`,
  since the RLS boundary key on this table is `division_id`.
- `is_league_match_captain(uuid)` — mirrors
  `is_bracket_match_captain` but for league matches.

`updated_at` is maintained by a per-table `touch_…` trigger function
matching the `event_divisions` convention (we don't have a global
`set_updated_at`). Added to the `supabase_realtime` publication so
hosts and captains can watch the schedule update live.

### Domain

[packages/domain/src/leagues/league-schedule.ts](../../packages/domain/src/leagues/league-schedule.ts):

- `LeagueScheduleMatch` — value-shaped entity validated at
  construction. Length-bounds `courtLabel` (40 chars) and `notes`
  (1,000 chars), rejects negative or non-integer scores, requires
  distinct teams when both are set, allows null/null for placeholder
  slots before the schedule is fully drawn.
- `LeagueSchedule` — aggregate root keyed by `DivisionId`
  (one schedule per division — the "league season" boundary).
  Holds an `EventWindow` (`{ startsAt, endsAt }`) so the aggregate
  can enforce **scheduledAt ∈ [startsAt, endsAt]** without taking a
  full `VolleyballEvent` dependency. `create()` validates the
  window; `fromPersistence()` skips it so re-dated events still
  hydrate. Mutators: `addMatch` / `removeMatch` / `replaceMatch`.

Invariants explicitly **deferred** (called out in JSDoc):

- Strict week contiguity (weeks must be 1..N with no gaps) — the
  schedule today allows sparse weeks so hosts can stub future weeks
  before filling earlier ones in. Revisit if it surfaces as a UX
  problem.
- Per-week team uniqueness (a team appearing in two matches in the
  same week) — same reasoning; the rule may be wrong for tournament-
  style league weekends.

### Repository port + adapter

Port:
[packages/domain/src/leagues/league-schedule-repository.ts](../../packages/domain/src/leagues/league-schedule-repository.ts)
defines `LeagueScheduleRepository` with `nextMatchId()`,
`findByDivisionId()`, and `save()`.

Adapter:
[packages/infrastructure/src/supabase-league-schedule-repository.ts](../../packages/infrastructure/src/supabase-league-schedule-repository.ts)
implements it. `findByDivisionId` joins
`event_divisions → events!inner(starts_at, ends_at)` to reconstruct
the `EventWindow` for the aggregate. `save()` uses the same
delete-all + reinsert pattern as
`SupabaseBracketRepository.save()` — the aggregate owns the whole
match list, so a diffing layer would be more code for the same
result. **Follow-up:** wrap in an RPC for transactional atomicity
once the application handler layer needs it.

### Types + tests

[packages/supabase/src/database.types.ts](../../packages/supabase/src/database.types.ts)
hand-patched with the new table's `Row` / `Insert` / `Update` /
`Relationships` block (Docker is off in this environment, so the
generated file is maintained manually). 17 new domain tests in
[packages/domain/src/leagues/league-schedule.test.ts](../../packages/domain/src/leagues/league-schedule.test.ts)
cover every invariant + the three mutators + the
`fromPersistence` window bypass. Domain suite is now **206 tests
passing**.

## Why an aggregate (not folded into `VolleyballEvent`)

The audit recommended either approach. Reasons we chose a separate
aggregate:

1. **Write volume.** League hosts update the schedule weekly — each
   match result is a write. Folding into `VolleyballEvent` would
   force loading the whole event aggregate to record one match
   result.
2. **Independent invariant surface.** Week numbering, team
   uniqueness within a match, scheduledAt-in-window — none of these
   touch event-level state. Keeping them on `LeagueSchedule` means
   `VolleyballEvent` doesn't grow another section of "league-only
   rules."
3. **Pairs cleanly with `Bracket`.** The playoff portion of a
   league reuses the existing `event_brackets` row keyed to the
   same `division_id` (audit § P1 #2). One division can carry both
   a `LeagueSchedule` (regular season) and a `Bracket` (playoffs)
   without either aggregate needing to know about the other.

## Why the `EventWindow` is on the aggregate, not the match

Two options:

- Take `EventWindow` as a `LeagueSchedule.create()` arg and
  validate per-match on add (chosen).
- Push `EventWindow` into each `LeagueScheduleMatch.create()`
  call.

The aggregate-level version keeps `LeagueScheduleMatch` a pure value
object — no external knowledge required to construct one. Callers
that already know the window (the application handler) carry it
into the aggregate; callers that don't (the repo, when hydrating
match rows) skip the check via `LeagueScheduleMatch.create()` and
let `LeagueSchedule.fromPersistence` short-circuit. The repo
already has to load `events.starts_at` / `ends_at` anyway to build
the aggregate, so the extra column on the divisions join is free.

## Why `save()` is delete-all-then-reinsert

Same pattern as `SupabaseBracketRepository.save()`. Diffing a
match list against the database costs more code and more queries
for no meaningful benefit while the aggregate is the sole writer.
Once the application layer needs transactional guarantees the
upgrade is a single RPC, not a refactor of the diff strategy.

## Why no UI / handlers in this bundle

The audit explicitly notes UI was waiting on this table to land
("UI / create form / filters are NOT wired up in this bundle —
scaffolding only … that work depends on P1 #2's
`league_schedule_matches` table landing first." — P1 #1
remediation log entry). With the table now live, the next bundles
can pick up:

1. Application handlers (`CreateLeagueSchedule`,
   `UpdateLeagueScheduleMatch`, `RecordLeagueMatchResult`).
2. Host schedule-editor server actions + page under
   `apps/web/src/app/events/[id]/league/`.
3. Public-facing league schedule view component.
4. Wire `SupabaseLeagueScheduleRepository` into the composition
   root [apps/web/src/lib/handlers.ts](../../apps/web/src/lib/handlers.ts).

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green:
206 domain + 17 application + 50 web tests.

## Follow-ups

- Application handlers + server actions + UI (above).
- Transactional `save()` via RPC.
- Strict week contiguity / per-week team uniqueness if a host
  reports a real conflict.
- Wire the repo into the composition root.
- Decide whether `packages/types/src/events.ts`'s
  `CreateEventSchema` refine for `Tournaments require format and
gender` should also apply to leagues. Today leagues skip that
  refine because the brief treats them as roster-based; confirm
  before shipping the league create form.
