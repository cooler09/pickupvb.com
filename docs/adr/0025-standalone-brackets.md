# 0025. Standalone tournament brackets — owner-scoped, event-free

- **Status:** Accepted
- **Date:** 2026-05-30
- **Relates to:** [ADR 0001 — Hexagonal architecture with CQRS-lite](0001-hexagonal-cqrs.md), [ADR 0006 — Event divisions](0006-event-divisions.md), [ADR 0017 — Walk-in registrations](0017-walk-in-registrations.md), [ADR 0023 — Live match scoring](0023-live-match-scoring.md), [ADR 0024 — Event & profile media](0024-event-and-profile-media.md)

## Context

The bracket aggregate is one of the richest pieces of the domain — single/double
elimination, round-robin, pool-play playoff with court/slot scheduling, winner
advancement, standings, and (ADR 0023) live scoreboard scoring. But it is only
reachable as a child of an event division: `event_brackets.division_id` is
`NOT NULL UNIQUE`, the parent event is derived through `event_divisions`, and
every RLS policy / RPC authorizes through `is_event_host(...)`.

A large class of users wants to run a bracket **without hosting an event** — a
pickup tournament at the gym, a friendly between a handful of teams, a one-off
where the full event machinery (geocoded venue, dates, capacity, ticketing,
Stripe-host gating, public listings) is pure overhead. They want the bracket
tool, not an event.

The decision is how to give them the full bracket feature set without coupling
to events.

## Decisions

- **True decoupling, not a synthetic hidden event.** We considered backing each
  standalone bracket with a hidden event + division owned by the creator, which
  would reuse the entire existing stack unchanged. Rejected: the `events` table
  requires a geocoded address, dates, capacity, and visibility, and feeds public
  listings / maps / search / sitemap. Synthetic rows would either need every
  required field faked or a carve-out path through `CreateEventCommand`, and
  would risk leaking into every public event surface. Instead we generalize the
  bracket's **scope identity** while reusing all of its **logic**.

- **The `Bracket` aggregate's scope ids become nullable; ownership is a new
  field.** `eventId` and `divisionId` are widened to `… | null` and a
  `ownerUserId: UserId | null` is added. This is safe because the aggregate's
  behaviour (`seedTeams / generate / generatePlayoff / recordResult / resetMatch
/ reorderPoolMatches / advancement`) never reads the scope ids — they are pure
  identity/scope fields echoed by getters that only the repo and handlers
  consume. A new `Bracket.createStandalone(id, ownerUserId, format, config?)`
  factory sits beside `create(...)`; the event path is byte-compatible. A bracket
  is **exactly one of** event-scoped or owner-scoped, enforced by a DB
  `CHECK ((division_id is not null) <> (owner_user_id is not null))`.

- **Standalone competitors live in a dedicated `bracket_teams` table, not
  `event_team_entries`.** Event-bracket competitors are `event_team_entries`
  rows, but the _creation_ path for those (even walk-ins, ADR 0017) flows through
  the `EventTeamRegistration` aggregate, whose `divisionId`/`eventId` are
  required, with `division_id NOT NULL`, a `source`/captain identity check
  matrix, and three-branch RLS. Generalizing it to a null-division,
  null-captain, owner-scoped shape would be a large, risky change to the event
  registration path. Standalone teams are just **typed-in names** (no roster, no
  captain account — the owner records every result), so a tiny `bracket_teams
(id, bracket_id, name)` table is the right size. This mirrors ADR 0024's "media
  is the same shape, mirror it rather than bend the heavy thing."

- **`bracket_seeds.entry_id` and `bracket_matches.entry_*_id` become polymorphic
  uuids** (their FKs to `event_team_entries` are dropped). The aggregate already
  treats `EntryId` as an opaque identifier, so the same columns now point at
  `event_team_entries.id` (event brackets) or `bracket_teams.id` (standalone).
  The cost is losing the DB-level `on delete cascade`/`set null` from
  `event_team_entries` into bracket rows — accepted pre-launch: the bracket is
  persisted by full-replace (`save_bracket`), so a deleted entry surfaces as an
  unknown team until the next save, and the integrity contract moves to the
  application layer. Documented here so the next reader doesn't "restore" the FK.

- **Authorization: owner is to a standalone bracket what host is to an event
  bracket.** The owner-gated full-replace operations (create / seed / generate /
  reset / reorder / add-team) are authorized in the application layer
  (`bracket.ownerUserId === requesterId`) and persist via the service-role admin
  client, exactly as the host-gated event operations do (AGENTS.md gotcha #8 —
  the app is the authority for full-replace, RLS for the match-actor RPC path).
  The match-result path keeps running through the user-scoped
  `record_bracket_match_result` RPC, which gains an
  `owner_user_id = auth.uid()` branch alongside the existing
  `is_event_host OR is_bracket_match_captain` gate. `is_bracket_match_captain`
  needs no change: it resolves captains through `event_team_entries.captain_id`,
  and standalone slots point at `bracket_teams`, so it correctly returns false —
  the owner is the only writer. RLS owner branches are added to every bracket
  write policy as defense-in-depth and to keep future user-scoped reads honest.

- **Creation requires a real (non-anonymous) account; the watch view is public.**
  Mirrors ADR 0024's media posture: `INSERT` RLS requires
  `auth.uid() = owner_user_id` and `is_anonymous = false`. A standalone bracket
  is editable only by its creator, has a public read-only `/brackets/[id]/watch`
  view (RLS `select using(true)`, no `force-dynamic` per the public-page caching
  rule), and shows up in the creator's "My brackets" list.

- **Live scoreboard scoring is gated behind the _creator's_ Pro**, the same model
  as the event host's Pro gate (ADR 0023). `match_live_scores.event_id` /
  `division_id` are made nullable and a `bracket_id` column is added so a
  standalone match can carry a live score; `upsert_match_live_score`'s
  `kind='bracket'` branch resolves owner-or-host. This is the heaviest sub-area
  and is built last; if deferred, standalone brackets simply ship with live
  scoring disabled (manual score entry only) and the rest of the feature is
  unaffected.

## Consequences

- The bracket aggregate, all generators, standings, the `save_bracket` RPC body,
  and the `_components` UI are reused unchanged — components gain only **additive
  optional props** (a pre-bound `actions` bag + `bracketBase`) so the event call
  sites stay byte-compatible.
- `SupabaseBracketRepository`'s select must switch from `event_divisions!inner`
  to a LEFT join, or every finder silently drops standalone rows. This is the
  single highest-risk line in the change.
- A follow-up may add a `bracketCacheTag(id)` builder if a cached watch read is
  introduced; today `revalidatePath('/brackets/[id]')` suffices.
- If `bracket_teams` ever needs rosters/captains/registration, it should grow
  toward the `event_team_entries` shape rather than the reverse — at which point
  unifying the two competitor tables can be revisited.
