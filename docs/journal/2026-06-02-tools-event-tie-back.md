# Host tools ↔ events: quick links + event tie-back (2026-06-02)

## Context

User request: audit the "division tools like brackets" workflow through the
persona lens, and — because the standalone tools we just shipped (team
randomizer, scheduler, seeding, standings, rotation, timer) "will be useful in
various tournaments, leagues, games and matches" — **add quick links** and **the
ability to use a tool and tie it back to an event**.

The audit ([docs/audits/tournament-tools-workflow.md](../audits/tournament-tools-workflow.md))
found the suite split into two disconnected halves: the standalone `/tools/*`
pages are parallel reimplementations of capabilities the event/bracket domain
already has RLS-gated write paths for (seeding ↔ `SeedBracketCommand`, randomizer
↔ `RegisterAdHocTeamCommand`, scheduler ↔ pool-play generation, standings ↔
auto-derived standings + `recordDivisionPlacement`). Only the **scoreboard**
bridged the gap, via `ScoreLiveButton` → `MatchBinding` →
`finalizeMatchFromScoreboard`. Everything else was a copy-paste dead-end, and
none of them were reachable from where a host actually runs an event.

## Decisions

- **Generalize the scoreboard's binding, don't invent a new mechanism.** New
  `EventToolBinding` (`?event=&division=&ret=`,
  [tools/\_lib/event-binding.ts](../../apps/web/src/app/tools/_lib/event-binding.ts))
  mirrors `scoreboard/_lib/binding.ts`. A bound tool pulls event data + offers a
  "Save to event" action; unbound it's the plain free tool. This is the proven
  pattern (ADR 0023/0025) and keeps the SEO landing pages unchanged.
- **Pull is server-side, never via the URL.** Roster/team lists are too large
  for a query string, so the tool's server `page.tsx` loads them through
  [load-event-tool-context.ts](../../apps/web/src/app/tools/_lib/load-event-tool-context.ts)
  (reusing `loadEventDetail` + `bracketRepo.listRegisteredTeams`) and hands the
  island new **optional** props. Unbound requests never call it, so they read no
  cookies and behave exactly as before.
- **Authorization reuses the existing gates.** The context loader returns `null`
  (→ render the plain tool) unless `event.canManage`, so a non-host who
  hand-crafts a `?event=` URL gets the generic tool with no data and no save
  button. Every write-back command (`RegisterAdHocTeamCommand`,
  `SeedBracketCommand`) re-authorizes in its handler + RLS regardless.
- **Write-back only where the domain has a real path; honest handoffs
  elsewhere.** Randomizer → ad-hoc teams and seeding → bracket seeds are genuine
  writes over existing commands. **Scheduler** has no "save arbitrary matchups"
  command (the domain _generates_ pool matches from a config), so its tie-back is
  pull + a "set up pool play on the bracket" note — not a fake write (audit
  TT-5). **Standings** is a shared, no-auth Realtime room where free-text team
  names can't be safely mapped to `event_team_entries.id`, and the event already
  auto-derives standings — so it pre-seeds the room with the division's teams
  (pull) and points the host at the canonical **Division podium** panel to record
  placements (audit TT-4), rather than a fragile direct write that could crown
  the wrong team.
- **Host-gated quick links, no spectator leak.** The manage dashboard's "Run the
  event" group gets a tools card; the bracket page's row lives **inside**
  `BracketWorkspace` (which resolves `canManage` client-side) so it never renders
  to spectators on the cacheable bracket page.
- **Caught an open-redirect in review.** `parseEventBinding`'s `ret` guard first
  accepted any leading-`/` string — including protocol-relative `//evil.com`. The
  unit test pinned it; the guard now also rejects `//` (see
  [event-binding.test.ts](../../apps/web/src/app/tools/_lib/event-binding.test.ts)).

## Changes

- **New shared layer:** `tools/_lib/event-binding.ts` (`parseEventBinding` +
  `eventToolHref`), `tools/_lib/load-event-tool-context.ts`,
  `tools/_components/event-binding-banner.tsx` (presentational, used in both
  server pages and client islands), `tools/_components/event-tools-card.tsx`.
- **Bound-aware tool pages + islands:** `team-randomizer`, `seeding`, `scheduler`
  (pull + banner), `standings` (pre-seed room + podium handoff). Each island
  gained optional `initialRoster`/`initialTeams`/`boundTeams`/`eventBinding`
  props; unbound render is unchanged.
- **Write-back adapters (thin, over existing commands):**
  `team-randomizer/event-actions.ts` (`saveRandomTeamsToEvent` → N×
  `RegisterAdHocTeamCommand`, `actingAsHost`), `seeding/event-actions.ts`
  (`applySeedingToBracket` → `SeedBracketCommand`). Both pair
  `revalidatePath(ret)` + `updateTag(eventCacheTag(eventId))` per the cache-tag
  convention, and return typed `Result`s (client-invoked).
- **Quick links:** `manage-dashboard.tsx` (tools card, tools chosen per event
  type) + `bracket-workspace.tsx` (host-gated, bound to the active division).
- **Tests:** `event-binding.test.ts` (parse + open-redirect guard),
  `team-randomizer/event-actions.test.ts`, `seeding/event-actions.test.ts`
  (mock the handlers; assert the command shape + typed-error classification +
  partial-progress reporting).

## Patterns observed

- **`searchParams` doesn't change the caching posture here.** The whole `/tools`
  subtree already renders dynamically (root layout cookie reads — `/tools/rotation`
  / `/tools/timer`, which were untouched, are `ƒ` in the build too), so adding
  `searchParams` to four tool pages introduced no static→dynamic regression. The
  AGENTS.md "no force-dynamic on public pages" rule still held: nothing opts out
  of caching that wasn't already.
- **`vi.mock` factories that read a const _eagerly_ need `vi.hoisted`.** The
  mocked `@/lib/handlers` is a plain object (`{ registerAdHocTeam: { execute } }`),
  so the factory reads the fn at eval time — before a bare `const fn = vi.fn()`
  exists (vitest hoists `vi.mock` above it). `vi.hoisted` fixes it. The
  chat-actions test avoided this only because it referenced its mock fn _lazily_
  inside an async getter. Worth promoting to AGENTS.md if it recurs.

## Follow-ups

- **timer / rotation** were not given a tie-back (the user prioritized the four
  data tools; these have no event data to pull/push). A bound "Back to event"
  banner is a cheap future add if desired.
- **Direct "record podium from the standings room"** (a binding-aware
  `/tools/standings/[code]` + a server action that re-resolves names →
  `entry_id`s server-side against `listRegisteredTeams`) is the deferred richer
  standings write-back. Left out to avoid a fragile/duplicative path this pass.
- **Multi-division launches** bind the event's first division from the manage
  card; the bracket workspace binds the active division. A division switcher on
  the bound tool page would let a host retarget without relaunching.
- **Seeding → bracket** requires the bracket to already exist in `setup`; the
  action surfaces a "create the bracket first" message. A future combined
  "create + seed" affordance could smooth that.
