# Free-agent → roster pickup (2026-06-06)

## Context

Phase 3b of the "wrap up outstanding items" plan. The event free-agent pool was
advertise-only: a `FreeAgentRow` showed a name + notes, and a captain rostered an
agent only through the generic, event-agnostic team-member picker — which never
cleared the agent's pool entry (the seam the free-agent memory describes). This
adds a first-class "Pick up" action that closes that seam.

## Decisions

- **Pickup = invite to the captain's roster team + clear the pool entry + a
  dedicated ping.** Team membership is invite-accept (no direct-add), so the
  agent lands as a _pending_ member; clearing the pool on pickup (not on accept)
  stops two captains racing for the same agent — a declined agent re-joins the
  pool. Matches the plan's "clears the pool entry."
- **Resolve the target team server-side, not in the UI.** `CaptainedTeamLite`
  (read model) carries no `divisionId`, so the action takes the agent's
  `divisionId` and looks up the caller's **roster** `event_team_entries` row in
  that division (`captain_id = caller`, `team_id not null`). This makes the
  captain check + division match unspoofable from the client; the UI gate is
  coarse (`viewerCaptainedTeams.some(isRegistered)`) and the action gives precise
  feedback (`fa_no_team` if they haven't registered a team in that division).
- **Dedicated `event.free_agent.picked_up` kind, not the generic `team.invite`.**
  The pickup calls the `addTeamMember` _handler_ directly (not the form wrapper
  that fires `team.invite`), so it fires its own contextual ping ("[Captain]
  picked you up for [Team]") deep-linking to the team page to accept — one ping,
  not two. email + push + in_app (mirrors `team.invite`).
- **Add before clear.** A `ConflictError` (already on the roster) aborts before
  the pool is touched; only a successful invite clears the pool. A `NotFound` on
  the clear (agent already gone — a race) is ignored.

## Changes

- `packages/notifications/src/kinds.ts` + `templates.ts` — new
  `event.free_agent.picked_up` kind (category/channels/payload + 3 renders).
- `apps/web/src/app/events/[id]/free-agent-actions.ts` — `pickUpFreeAgent`
  action (server-side team resolution, invite, pool clear, ping).
- `apps/web/src/app/events/[id]/_components/free-agent-signup-panel.tsx` —
  `viewerCanPickUp` prop; per-row "Pick up" button (`FreeAgentRow`); 4 flash
  codes (`picked_up` / `fa_no_team` / `fa_already_member` / `forbidden`).
- `event-signup-area.tsx` — passes `viewerCanPickUp` to both panel instances.

## Patterns observed

- **Fire the dedicated kind from the _handler_, not the form wrapper, to avoid a
  double-ping.** `addMemberFromForm` bakes in a `team.invite` notification; a
  feature that wants its own context calls `handlers.addTeamMember` directly and
  owns the ping. Same shape will apply to any other "invite under a different
  banner" flow.

## Follow-ups

- **Deploy-gated:** the server-side team resolution + pool clear + ping can't run
  in the local quad (no Docker). Verify on dev: a captain with a registered team
  sees "Pick up" on an agent in that division → agent gets the pending invite +
  the ping + drops off the pool. The Bianca persona e2e ("picks up Tyler") can
  assert the closed seam after deploy.
- **Auto-accept copy:** if the agent has `auto_accept_team_invites`, they're
  added active immediately but the email still says "Accept the invite" — a minor
  wording nuance for an opt-in edge case, left as-is.
- **No domain change** (web orchestration over existing handlers), so no new
  unit test; the new notification kind is type-checked exhaustively.
