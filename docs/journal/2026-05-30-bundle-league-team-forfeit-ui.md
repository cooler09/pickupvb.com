# 2026-05-30 — Bundle: League team forfeit host UI

Follow-up to
[`2026-05-30-bundle-p2-7-league-forfeit.md`](2026-05-30-bundle-p2-7-league-forfeit.md).
That bundle landed the `event_team_entries.forfeited_at` column and
the types-stub patch but stopped short of any app-layer plumbing —
no port, no handler, no panel. This bundle wires the host-facing
half so a league host can actually mark a rostered team as withdrawn
mid-season and reinstate them if it was a mistake.

## Why this bundle

The schema change alone is invisible to users. Without a host
affordance the column would have stayed dormant pending the
LeagueSchedule generator RPC (deferred separately). Surfacing it
now buys us two things ahead of that RPC:

1. **Host instinct.** League hosts who lose a team mid-season can
   already record the withdrawal at the data layer, even if the
   downstream schedule view doesn't honor it yet. Better than
   "no UI, please email us" while we finish the generator.
2. **A live integration surface for the LeagueSchedule work.**
   When the generator lands it gets to query `forfeited_at`
   instead of speculating about a column nobody writes to.

We deliberately kept the surface to the minimum the user asked for
("Minimal: forfeit affordance only") — no settings panel for league
team management more broadly, no captain-facing self-withdrawal,
no audit log for who/when forfeited beyond the timestamp.

## What shipped

**Domain.**
[`packages/domain/src/brackets/bracket-repository.ts`](../../packages/domain/src/brackets/bracket-repository.ts)
— `BracketTeamLite` grew `forfeitedAt: Date | null`. The type is
used by the bracket UI and now by the league-teams loader, so it
becomes the canonical lightweight league-team read model too.
[`packages/domain/src/events/event-repository.ts`](../../packages/domain/src/events/event-repository.ts)
gained the aggregate-light port
`setRosterTeamForfeited(divisionId, teamId, forfeitedAt)` — mirroring
the existing `attachTeamToDivision` precedent because
`event_team_entries` rows have no aggregate that owns them
end-to-end.

**Application.** New file
[`packages/application/src/commands/league-roster.handler.ts`](../../packages/application/src/commands/league-roster.handler.ts)
exposes `SetLeagueTeamForfeitedCommand(eventId, divisionId, teamId, requesterId, forfeited)`
and `SetLeagueTeamForfeitedHandler`. Authorization matches the
league-schedule handlers:

- `event.findById(eventId)` → `NotFoundError` if missing.
- `event.hostId !== requesterId` → `UnauthorizedError`.
- `event.type !== 'league'` → `ValidationError`.
- Division must exist on the event → `NotFoundError`.

A handler-level guard is intentionally not "duplicating" RLS — the
event-type and division-existence guards turn a generic 500
("Postgres permission error") into a typed `DomainError` that maps
to a clean flash on the page. RLS on `event_team_entries` is the
real authority and remains the backstop.

Six handler tests in `league-roster.handler.test.ts` cover happy path,
clear-the-flag, and each of the four error branches.

**Infrastructure.**
[`packages/infrastructure/src/supabase-bracket-repository.ts`](../../packages/infrastructure/src/supabase-bracket-repository.ts)
`listRegisteredTeams` now selects `forfeited_at` and maps it to
`BracketTeamLite.forfeitedAt`.
[`packages/infrastructure/src/supabase-event-repository.ts`](../../packages/infrastructure/src/supabase-event-repository.ts)
implements `setRosterTeamForfeited` with a single `UPDATE` filtered to
`source = 'roster' AND deleted_at IS NULL` so the call can't
accidentally retag an ad-hoc / walk-in / withdrawn entry.

**Web.** New loader function `loadLeagueTeamsByDivision` in
[`apps/web/src/app/events/[id]/_loaders/load-event-detail.ts`](../../apps/web/src/app/events/[id]/_loaders/load-event-detail.ts)
gated on `event.canManage && event.type === 'league'` and joined into
the existing Wave-1 `Promise.all`. The new `LeagueTeamView` shape
(`{teamId, name, forfeitedAt}`) is the page-boundary projection —
camelCase, no DB columns leaking into the panel.

New server-actions file
[`apps/web/src/app/events/[id]/league-team-actions.ts`](../../apps/web/src/app/events/[id]/league-team-actions.ts)
exposes `markLeagueTeamForfeitedFromForm` and
`reinstateLeagueTeamFromForm`. Both:

- Take `(eventId, divisionId, teamId, returnPath, _formData)` so they
  bind cleanly into `<form action={fn.bind(null, …)}>` per the
  AGENTS.md convention.
- Map typed `DomainError` subclasses to `?forfeit=…` flash params via
  `redirectEventNotice` (new key added to the union in
  [`server-redirects.ts`](../../apps/web/src/lib/server-redirects.ts)).
- Pair `revalidatePath(returnPath)` with
  ``updateTag(`event:${eventId}`)`` per AGENTS.md Pattern 1.

New server component
[`apps/web/src/app/events/[id]/_components/league-teams-panel.tsx`](../../apps/web/src/app/events/[id]/_components/league-teams-panel.tsx)
renders one row per rostered team per division with either a
"Mark forfeited" or "Reinstate" form-bound button, plus a pill showing
the forfeit date when set. Style copied from
`HostDivisionWinnersPanel` so the two host-tools sections feel like
one family. Gated into
[`host-tools-section.tsx`](../../apps/web/src/app/events/[id]/_components/host-tools-section.tsx)
on `event.type === 'league' && event.divisions.length > 0` —
right next to the tournament-only winners panel, so the host-tools
disclosure now branches cleanly by event type.

**Wiring.** `setLeagueTeamForfeited` registered in
[`apps/web/src/lib/handlers.ts`](../../apps/web/src/lib/handlers.ts).

## Alternatives rejected

- **Add a `forfeitedAt` field to `EventTeamRegistration` and ship it
  through the aggregate.** Considered. The aggregate already lacks a
  place for `divisionId` (which is why `attachTeamToDivision` is an
  aggregate-light port) and the forfeit lifecycle is the same shape
  — a single-column write that bypasses any state machine. Adding
  the field to the aggregate would require carrying it on every
  registration construction path for one panel. Logged as a
  follow-up to revisit when the LeagueSchedule generator needs to
  read the value through a domain-level read model rather than the
  port.
- **Soft-delete the roster entry instead.** Wrong semantics —
  forfeit means "team is still in the league but their remaining
  matches don't count," not "team never existed." Soft-delete would
  hide them from standings.
- **Captain-driven self-withdrawal.** Out of scope for the minimal
  bundle. Adding it later is additive: a separate handler with a
  different auth posture (captain instead of host), pointing at the
  same port.

## Patterns confirmed / surfaced

- **Aggregate-light port for cross-cutting one-column writes** —
  precedent: `attachTeamToDivision`. The pattern keeps the domain
  honest (no Supabase imports) without forcing every new field into
  a full aggregate event. Worth promoting into the AGENTS.md
  "Patterns surfaced by audits" section if a third instance appears.
- **Server-action FormData adapter signature** — the trailing
  `_formData: FormData` arg is required even when unused for the
  React form-action type to accept the bound function. AGENTS.md
  already documents this; this bundle is another data point.
- **Flash-param redirect key as a union** —
  `redirectEventNotice`'s `key` parameter is a string-literal union;
  every new affordance widens it. Adding `'forfeit'` here keeps the
  ad-hoc mapping disciplined.

## Follow-ups deferred

- **LeagueSchedule generator** consumes `forfeitedAt` (skip remaining
  matches). Carried unchanged in the audit's follow-ups list.
- **`EventTeamRegistration.forfeitedAt` aggregate mirror** for any
  read-side that needs the value through the aggregate rather than
  the bracket repo. Carried unchanged.
- **Bracket-reader `source='roster'` filter loosening** so league
  rosters can feed both standings + brackets without two queries.
  Carried unchanged.

## Verify

```
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

15/15 typecheck · lint at the 3 pre-existing scoreboard warnings ·
208 domain + 38 application + 50 web tests passing (incl. 6 new
handler tests) · 8/8 build.
