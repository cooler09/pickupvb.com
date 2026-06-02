# Walk-in teams no longer credit the host as captain (2026-06-02)

## Context

User report: when a host adds a "walk-in" team from the bracket setup (or
saves randomizer-generated teams back to an event), the host is recorded as
the team's **captain**. That produces false positives everywhere a user's
participation is derived from team membership — collector/achievement badge
stats (`compute_player_badge_stats`, whose `user_entries` CTE joins
`event_team_entries.captain_id = p_user_id`), the host's "your upcoming
events" / "my teams" surfaces, and the per-viewer captain controls on the
event page.

Root cause: both host-proxy write paths reused
`RegisterAdHocTeamCommand(..., actingAsHost = true)`, which sets
`captain_id = <host user id>` and `source = 'ad_hoc'`. The acting host is the
_creator_ of these teams, not a player on them — there is genuinely no
captain account. ADR 0017 already models exactly this case
(`RegisterWalkInTeamCommand` → `source = 'walk_in'`, `captain_id = null`),
but the bracket/randomizer paths predated/diverged from it.

## Decisions

- **Chose routing both host-proxy paths through `RegisterWalkInTeamCommand`
  over relaxing the walk-in invariant.** The `event_team_entries`
  source-identity CHECK (and the `EventTeamRegistration` aggregate) require a
  non-null `captain_display_name` when `source = 'walk_in'`. Allowing a null
  display name would mean a new migration altering an applied CHECK
  constraint plus a domain + command-signature change — a broad,
  locally-unverifiable blast radius (Docker is down; migrations auto-apply on
  deploy). Reusing the existing, tested walk-in handler keeps the change to
  the web action layer.
- **Chose the team name as the stand-in `captainDisplayName`.** The bracket
  walk-in form and the randomizer collect no captain identity, but the model
  requires a freeform name. The team name is the natural "name at the table";
  the host can rename later. Cosmetic only — it surfaces as
  "Captain: <team name>" in the host-only team-registrations panel.
- **No source-filtering regressions.** Every registration read filters on
  `source != 'roster'` (or treats ad_hoc/walk_in together);
  `listRegisteredTeams` reads all entries in a division regardless of source.
  Switching ad_hoc → walk_in keeps these teams in seeding, capacity, and the
  bracket. The only `'ad_hoc'` literals in app code key on the _division's_
  `teamRegistrationMode`, not the registration `source`.

## Changes

- `apps/web/src/app/events/[id]/bracket/actions.ts` — `addWalkInTeam` now
  calls `RegisterWalkInTeamCommand` (captain_id null) instead of
  `RegisterAdHocTeamCommand(actingAsHost)`. Import + doc comment updated.
- `apps/web/src/app/tools/team-randomizer/event-actions.ts` —
  `saveRandomTeamsToEvent` likewise routes each generated team through the
  walk-in command. Import + doc comment updated.
- `apps/web/src/app/tools/team-randomizer/event-actions.test.ts` — pins the
  corrected contract: one `RegisterWalkInTeamCommand` per team, `hostId`
  carries the creator, `captainDisplayName` = team name, no captain account.

## Patterns observed

- Two "walk-in" concepts had drifted: ADR 0017's first-class walk-in
  (`source = 'walk_in'`, captain_id null) and a host-proxy ad-hoc shortcut
  (`actingAsHost`, captain_id = host). The shortcut quietly leaked the host
  into every participation-by-membership query. When a model already exists
  for "team with no captain account," reuse it rather than overloading the
  captain field with the creator.

## Follow-ups

- **Existing data not backfilled.** Pre-fix rows have
  `source = 'ad_hoc', captain_id = <host>`. They are _not_ distinguishable by
  data alone from a legitimate host self-signup (a host who genuinely plays
  in their own tournament also has `captain_id = host` on an ad_hoc entry), so
  a blanket backfill would wrongly strip real registrations. Cleanup, if
  wanted, needs a manual/heuristic pass (e.g. entries whose only members have
  `user_id IS NULL`). Deferred — fixing the write path stops the bleed going
  forward.
