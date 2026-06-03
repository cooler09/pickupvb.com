# Captain claim — host assigns a captain (ADR 0033 Phase 3) (2026-06-03)

The last deferred piece of the host-managed-teams initiative: a host-added
(account-less) team can now be linked to a real captain's account. Implements
ADR 0017 §7 ("captain-replaceable identity"), which ADR 0033 carried forward as
Phase 3.

## Decision: host assigns, not captain self-claims

The product fork was "captain claims via link/code" vs. "host assigns the
captain." We chose **host-assign** (the user picked it):

- The `event_team_entries` UPDATE RLS is `auth.uid() = captain_id OR host`. A
  **host** can already set `captain_id` under that policy; a **captain claiming
  themselves** can't (they're not the captain yet) — that path would need a
  claim-token column + a SECURITY DEFINER claim RPC + a `/claim` route.
- Host-assign needs **none** of that: it reuses the existing
  [`UserPicker`](../../apps/web/src/components/user-picker.tsx) and the
  admin-client repo the sibling host actions already use. The host is already in
  the loop managing these teams.

Claim-link stays a possible future enhancement; host-assign delivers the core
value (a real account behind the team) with the least surface.

## What "assign" does

`EventTeamRegistration.assignCaptain(captainId)` (new aggregate mutator,
[event-team-registration.ts](../../packages/domain/src/events/event-team-registration.ts)):
flips a `walk_in` entry to a real captain — sets `captainId`, changes
`source: WalkIn → Captain` (DB `walk_in → ad_hoc`), and clears the freeform
`captainDisplayName` / `captainPhone` (the captain's profile supplies the name
now). Only legal on a `walk_in` row; throws `InvariantViolation` otherwise. To
make `captainId`/`source`/`captainDisplayName`/`captainPhone` mutable, they moved
from `public readonly` constructor fields to private fields + getters — the
public read API is unchanged, so no callers move.

## Changes

- Domain: `assignCaptain` + the readonly→getter refactor; 2 new tests
  ([event-team-registration.test.ts](../../packages/domain/src/events/event-team-registration.test.ts)).
- Action: `assignTeamCaptainFromForm`
  ([host-team-registration-actions.ts](../../apps/web/src/app/events/%5Bid%5D/host-team-registration-actions.ts))
  — co-host aware (authorizes via `authorizeHost`/`canManage`, like its
  siblings), enforces "one team per captain per division" via
  `existsForCaptainInDivision`, then `assignCaptain` + `save` on the admin-client
  repo (host already authorized — pitfall #8). Two flash codes added
  (`captain_assigned`, `captain_dup`).
- UI: an "Assign captain" `FormModal` with the `UserPicker` on every host-added
  row in [HostAdHocTeamsPanel](../../apps/web/src/app/events/%5Bid%5D/_components/host-ad-hoc-teams-panel.tsx).

## The payoff lands through existing surfaces (no extra UI)

Once assigned, the entry is `source='ad_hoc'` with a real `captain_id`, so it
flows through paths that were already there:

- The **public roster** drops the "Added by host" pill (it's keyed on `walk_in`)
  and shows the real captain name (resolved from the profile).
- The captain sees the team in **their own registrations** (`viewerRegistrations`
  filters `captain_id === viewer`).
- On **leagues**, `is_league_match_captain` now resolves the captain (Phase 4
  keyed match wiring on the entry, whose `captain_id` is now set), so the captain
  can self-report match scores — previously host-only for a host-added team.

Quad-green: typecheck 15/15, lint 15/15, tests 484 domain + 48 infra + 115 app +
214 web, build 8/8.

## Status

The host-managed-teams initiative is now **feature-complete** (Phases 1–4 + the
co-host gate). No deferred pieces remain except the optional claim-link variant,
which host-assign makes non-urgent. All uncommitted — the user reviews + commits.
