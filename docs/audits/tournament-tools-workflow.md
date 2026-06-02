# Tournament-tools workflow audit

_Last updated: 2026-06-02_

Feature-scoped audit of the **tournament-running tool suite** — the host's
divisions/bracket/schedule surfaces under `/events/[id]/*` and the standalone
host tools under `/tools/*` (team randomizer, round-robin scheduler, seeding,
standings, court rotation, match timer, live scoreboard) — read through the
**persona / workflow** lens.

Complementary to, not a duplicate of:

- [persona-ux.md](persona-ux.md) — site-wide CTA/field vocabulary + persona
  journeys. This file is feature-scoped to the tools↔event workflow.
- [m3-alignment.md](m3-alignment.md) — token/primitive conformance.
- [event-data-model.md](event-data-model.md) — the bracket/match write paths and
  their RLS posture (the commands this audit's tie-back reuses).

> **Scope note:** full written audit (not a quick scan). Findings graded
> P1/P2/P3 per [README.md](README.md), each with a file link + concrete fix. The
> 2026-06-02 bundle implements TT-1/TT-2 (quick links + event tie-back); see the
> **Remediation log** at the bottom.

---

## The personas (as they touch the tools)

| Persona                         | Where they are                                                         | What they need                                                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Host running a tournament**   | `/events/[id]/manage`, `/events/[id]/bracket`, `/events/[id]/schedule` | The tools **where they run the event**, pre-filled with the event's roster/teams, with results landing back on the official record |
| **Casual organizer (no event)** | `/tools/*`                                                             | A no-signup utility that just works — and a clear path to "do this for real" (tie to an event) when they're ready                  |
| **Spectator / player**          | `/events/[id]/bracket/watch`, scoreboard `/s/[code]`                   | Read-only live state (already served well)                                                                                         |

---

## Root-cause theme: the tools and the event suite are two disconnected halves

The event domain already owns rich, RLS-gated write paths for everything the
standalone tools compute:

| Standalone tool                 | Event-domain equivalent it duplicates                                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools/seeding`                 | `SeedBracketCommand` + [`seeding-list.tsx`](../../apps/web/src/app/events/[id]/bracket/_components/seeding-list.tsx)                                              |
| `tools/scheduler` (round-robin) | pool-play generation — `GenerateBracketCommand` (`pool_play_playoff` + `poolSchedule: round_robin`)                                                               |
| `tools/team-randomizer`         | `RegisterAdHocTeamCommand` / `addWalkInTeam` ([`bracket/actions.ts`](../../apps/web/src/app/events/[id]/bracket/actions.ts#L360))                                 |
| `tools/standings`               | auto-derived standings + [`HostDivisionWinnersPanel`](../../apps/web/src/app/events/[id]/_components/host-division-winners-panel.tsx) / `recordDivisionPlacement` |

Only the **scoreboard** bridges the two halves — via `ScoreLiveButton` →
`MatchBinding` → `finalizeMatchFromScoreboard`
([binding.ts](../../apps/web/src/app/tools/scoreboard/_lib/binding.ts),
[score-live-button.tsx](../../apps/web/src/app/events/[id]/_components/score-live-button.tsx),
[finalize-actions.ts](../../apps/web/src/app/tools/scoreboard/[code]/finalize-actions.ts)).
That binding pattern is the model the rest of the suite should copy; today the
other six tools are dead-ends that emit copy-paste text.

---

## Findings

### TT-1 — Discovery gap: the standalone tools are invisible from the event surfaces · **P2**

The host's command center —
[manage-dashboard.tsx](../../apps/web/src/app/events/[id]/manage/_components/manage-dashboard.tsx)
"Run the event" group — links only to **Bracket** and **Schedule**. There is no
in-context link to the randomizer, scheduler, seeding, standings, timer, or
rotation tools. They're reachable only from the global "Host tools" nav
([site-header.tsx#L140](../../apps/web/src/components/site-header.tsx#L140)), so
a host mid-tournament has to leave their event, find the tool, and copy data by
hand. The bracket page header
([bracket/page.tsx#L116-L136](../../apps/web/src/app/events/[id]/bracket/page.tsx#L116-L136))
has the same gap.
**Fix:** a "Tools" quick-links card in the manage dashboard's Run-the-event group
and a tools row on the bracket page, each launching `/tools/<tool>` with the
event/division bound via query string.

### TT-2 — Disconnection: tool output is a dead-end, not an event write · **P2**

Per the root-cause table, a host who uses a standalone tool while running an
event gets a text blob they must re-key into the event. The event domain already
has the write path for each (`SeedBracketCommand`, `RegisterAdHocTeamCommand`,
`recordDivisionPlacement`, pool-play generation), all host/captain-authorized in
their handlers + RLS — they're simply not reachable from the tools.
**Fix:** generalize the scoreboard's `MatchBinding` into an `EventToolBinding`
(`?event=&division=&ret=`). When bound, a tool's server `page.tsx` pulls the
event's roster/teams (gated on `event.canManage`), pre-fills the island, and
offers a "Save to event" action that calls the existing command:

- randomizer → `RegisterAdHocTeamCommand` per generated team
- seeding → `SeedBracketCommand` (apply the computed order)
- standings → `recordDivisionPlacement` for the top 3
- scheduler → deep-link into the bracket's pool-play config (the domain
  generates pool matches; it has no "save arbitrary matchups" write — see TT-5)

### TT-3 — A tool launched while running an event shows no connection to it · **P3**

The `/tools/*` pages are framed as standalone no-signup utilities and have no
affordance acknowledging they were opened from an event. A host who clicks
through from their event sees the generic tool with no "you're working on _Event
X_" context and no way back.
**Fix:** when an `EventToolBinding` is present, render a "Connected to _Event_"
banner above the tool with the save + "Back to event" actions. Absent the
binding the page is byte-identical to today (preserves the SEO/no-signup
posture).

### TT-4 — Two homes for the same job (seeding / standings) · **P3**

Seeding and standings overlap heavily with bracket built-ins: the bracket page
already reseeds via [seeding-list.tsx](../../apps/web/src/app/events/[id]/bracket/_components/seeding-list.tsx)
and standings are auto-derived from recorded results. Without a clear "feeder vs.
canonical" story, a host won't know whether to use the tool or the bracket.
**Fix (positioning, not code):** treat the standalone seeding/standings as
**feeders into the bracket** — the bracket page stays the canonical surface; the
tool's only event-bound action is "apply to the bracket / record the podium."
Document this so the two surfaces don't compete. The genuinely net-new tie-back
is **randomizer → ad-hoc teams** (no equivalent quick path exists on the event
side today) and the **discovery quick links** (TT-1).

### TT-5 — Scheduler has no domain write path for arbitrary matchups · **P3**

The standalone scheduler emits a free-form round-robin slate, but the bracket
domain **generates** pool matches from a `pool_play_playoff` config and only
allows **reordering** them afterward (`ReorderPoolMatchesCommand`) — there is no
command to insert an arbitrary externally-authored schedule.
**Fix:** the scheduler's event tie-back is a **deep-link** into
`/events/[id]/bracket` with the pool-play format + court labels pre-filled, not a
write. Documented honestly so a future contributor doesn't try to wire a
non-existent "save schedule" command.

### TT-6 (positive) — The scoreboard binding is the model to copy

[binding.ts](../../apps/web/src/app/tools/scoreboard/_lib/binding.ts) +
[finalize-actions.ts](../../apps/web/src/app/tools/scoreboard/[code]/finalize-actions.ts)
already prove the whole pattern: a tool that is the plain free tool when unbound
and an event-connected tool when it carries a binding, re-checking authorization
server-side and reusing the unchanged domain commands. The `EventToolBinding`
generalization (TT-2) should mirror it shape-for-shape.

---

## Remediation log

### 2026-06-02 — bracket workflow redesign (ADR 0032, cross-reference)

The host bracket surface in this audit's scope (`/events/[id]/bracket`) was rebuilt
under [ADR 0032](../adr/0032-bracket-workflow-redesign.md): a `draft → live`
lifecycle, manual override of seeding / pools / schedule / matchups / results,
uneven pools with target-games (repeats), per-stage + per-match length, and
auto cross-seeded playoffs. This sits adjacent to the tools↔event tie-back work
below (it changes the canonical bracket surface the standalone seeding/scheduler
tools feed into — TT-4/TT-5). Full narrative across the five bundles:
[domain](../journal/2026-06-02-bundle-bracket-workflow-redesign-domain.md),
[commands](../journal/2026-06-02-bundle-bracket-workflow-redesign-commands.md),
[create-ui](../journal/2026-06-02-bundle-bracket-workflow-redesign-create-ui.md),
[draft-workspace](../journal/2026-06-02-bundle-bracket-workflow-redesign-draft-workspace.md),
[live-board](../journal/2026-06-02-bundle-bracket-workflow-redesign-live-board.md),
[polish/e2e](../journal/2026-06-02-bundle-bracket-workflow-redesign-polish-e2e.md).
Static quad green; **e2e authored to the new flow but not yet run against dev**
(deploy-gated).

### 2026-06-02 — quick links + event tie-back (TT-1/TT-2 shipped; TT-3/4/5 addressed)

Bundle narrative: [journal 2026-06-02](../journal/2026-06-02-tools-event-tie-back.md).
Verify chain green (typecheck / lint / 214 web tests / build).

- **TT-1 — fixed.** Host-tools quick-links card added to the manage dashboard's
  "Run the event" group ([manage-dashboard.tsx](../../apps/web/src/app/events/[id]/manage/_components/manage-dashboard.tsx))
  and a host-gated tools row inside
  [bracket-workspace.tsx](../../apps/web/src/app/events/[id]/bracket/_components/bracket-workspace.tsx)
  (bound to the active division; rendered only after `canManage` resolves, so no
  spectator leak). New [event-tools-card.tsx](../../apps/web/src/app/tools/_components/event-tools-card.tsx).
- **TT-2 — fixed (randomizer + seeding write paths; scheduler/standings handoffs).**
  New `EventToolBinding` ([event-binding.ts](../../apps/web/src/app/tools/_lib/event-binding.ts))
  - server context loader ([load-event-tool-context.ts](../../apps/web/src/app/tools/_lib/load-event-tool-context.ts),
    gated on `event.canManage`). Bound tools pull roster/teams and save back via the
    unchanged commands: randomizer → `RegisterAdHocTeamCommand`
    ([event-actions.ts](../../apps/web/src/app/tools/team-randomizer/event-actions.ts)),
    seeding → `SeedBracketCommand`
    ([event-actions.ts](../../apps/web/src/app/tools/seeding/event-actions.ts)).
- **TT-3 — fixed.** Bound tools render the "Connected to your event" banner
  ([event-binding-banner.tsx](../../apps/web/src/app/tools/_components/event-binding-banner.tsx))
  with save + "Back to event".
- **TT-4 — addressed (positioning).** Standings stays a **feeder**: the bound
  room pre-seeds the division's teams and the banner points to the canonical
  Division podium panel (`recordDivisionPlacement`) to record placements — no
  fragile name→`entry_id` write from the shared room. Seeding likewise feeds the
  bracket rather than competing with its seeding-list.
- **TT-5 — addressed (honest deep-link).** Scheduler is pull + a "set up pool
  play on the bracket" note; no fake "save schedule" write (the domain has none).
- **Open-redirect guard** hardened in `parseEventBinding` (`//host` rejected),
  pinned by [event-binding.test.ts](../../apps/web/src/app/tools/_lib/event-binding.test.ts).

Deferred (see journal Follow-ups): timer/rotation tie-back; a direct
"record podium from the standings room"; a division switcher on bound tool pages.

---

## How to re-run this audit

1. Walk a host through running a real tournament: create event → divisions →
   seed → schedule → score → podium. Note every point they'd reach for a tool
   and whether it's one click away **and** lands back on the event.
2. Re-check the root-cause table: does each standalone tool have an event-bound
   "Save to event" path, or is it still a copy-paste dead-end?
3. Update the remediation log + flip the README index row date.
