# League host-added teams — follow-ups: co-host gate + a scheduling-gap finding (2026-06-03)

Follow-up pass on the ADR 0033 Phase 2 bundle. One fix shipped; one larger gap
surfaced (documented, not yet built — needs a product call).

## Shipped: co-host can add + mark-paid host-added teams

The walk-in **add** + **mark-paid-cash** paths were primary-host-only
(`RegisterWalkInTeamHandler` / `MarkWalkInPaidCashHandler` check
`event.hostId === requester`), while the sibling host actions
(`hostMarkTeamRegistrationPaid`, refund, force-withdraw) were already co-host
aware because they authorize at the boundary via the read model's `canManage`.

**Fix** ([walk-in-team-actions.ts](../../apps/web/src/app/events/%5Bid%5D/walk-in-team-actions.ts)):
both host-panel actions now authorize via a new `authorizeManageAsHost(eventId)`
helper (gates on `canManage` — co-hosts + host-group admins) and pass the
**event's primary host id** (`detail.hostUserId`) to the command, so the
handler's host guard is satisfied while the viewer's permission was checked at
the boundary. The handler is unchanged — it's still the authz backstop for the
other two callers (bracket `addWalkInTeam`, team-randomizer) that rely on it.

- Why pass the host id rather than the viewer id: a host-added (`walk_in`) entry
  exists _on behalf of the event host_; `hostId` is the event host, not
  necessarily the actor. This matches the sibling actions' boundary-authz model
  and lifts the primary-host-only limit without a domain co-host port (which
  still doesn't exist — see `SetLeagueTeamForfeitedHandler`).
- Doc on `RegisterWalkInTeamCommand` ([messages.ts](../../packages/application/src/messages.ts))
  updated: now ad-hoc **or** roster divisions; `hostId` is the event host,
  viewer authorized at the boundary.

Quad-green (typecheck/lint/test/build). The cross-event isolation here is
identical to the existing `hostMarkTeamRegistrationPaid` (authorize on `eventId`,
load reg by id) — consistent, not a new gap.

## Surfaced (NOT built): host-added league teams can't be scheduled yet

While assessing the "two panels / entry-id forfeit" and "public league roster"
follow-ups, the root issue turned out to be bigger and shared:

**League play keys on `teams.id`, but host-added teams are team-less.** League
schedule matches store `league_schedule_matches.home_team_id` / `away_team_id`
as FKs into `teams.id`; standings/forfeit (`event_team_entries.forfeited_at` via
`setLeagueTeamForfeited(teamId)`) are likewise `teams.id`-keyed. Host-added
entries are `walk_in` with `team_id = null`, so
[schedule/page.tsx](../../apps/web/src/app/events/%5Bid%5D/schedule/page.tsx)
prunes them (`allEntries.flatMap(t => t.teamId ? … : [])`).

So Phase 2, as shipped, lets a league host **register + mark paid** off-platform
teams, but those teams **cannot be scheduled, scored, or appear in standings**.
For a host whose league is mostly off-platform registrations (the stated common
case), that's a half-feature.

The clean fix is **Phase 4: migrate league play from `teams.id` to
`event_team_entries.id`** — exactly the cutover brackets already did
(`winner_entry_id`, bracket-match `entry_id`). That unifies leagues onto the
same entry identity and makes team-less host-added teams first-class league
participants. It needs an ADR, a migration (`league_schedule_matches` home/away
FK → entries, plus backfill), the schedule repo + standings + forfeit moved to
entry ids, and e2e. Too big to bundle as a quick follow-up — flagged for a
product call before building.

Interim: the now-accurate note in `schedule/page.tsx` flags the pruning + the
Phase 4 follow-up for the next reader.

## Status of the three original follow-ups

- **#1 co-host** — DONE (above).
- **#2 unify panels + entry-id forfeit** — subsumed by the Phase 4 finding;
  forfeit is one of several `teams.id`-keyed league features. Don't do piecemeal.
- **#3 public league roster** — deferred; partly redundant with the schedule /
  standings page, and only fully meaningful once host-added teams are
  schedulable (Phase 4). A bare roster of unschedulable teams would mislead.
- **Pre-existing:** bracket `addWalkInTeam` + team-randomizer are still
  primary-host-only (they offload authz to the handler); lifting them to co-host
  is a separate, optional pass.
