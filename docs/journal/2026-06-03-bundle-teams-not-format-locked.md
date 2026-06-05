# Teams are just a roster of people — format removed entirely (2026-06-03)

## Context

A persistent `Team` was bound to a single `Format` at creation, and that
binding was load-bearing in two ways: it derived the roster cap
(`maxRoster = playersPerSide(format) + 2`) and it hard-gated registration
(a team could only enter a division of the **same** format). User feedback:
that's an artificial barrier — "it is more fun if a team can play many
formats regardless of the team size" — followed by "remove it from the team…
I would like the team to just be a group of people and not format specific."

A friend group / club is a durable roster of people, not a single-format
entry; the format belongs to the division they walk into, not to the humans.
This fought [ADR 0013](../adr/0013-team-identity-and-history.md), whose goal
is one durable team identity with cross-event history — format-on-team forced
the same squad to exist as two `Team` rows to play 6s and 4s. The ad-hoc
registration path (`EventTeamRegistration`, the tournament default) already
carries **no** format and works fine — proof the format lives on the division.

This landed in two passes within one session: first remove the _barrier_
(keep `format` as a descriptor), then, per the follow-up request, remove
`format` from the team **entirely**. The notes below describe the end state.

## Decisions

- **`format` comes off `Team` completely — column, aggregate field, command,
  read models, and UI.** A team is now just `{ id, captain, name, members,
extra_member_count }`. The competition's format lives only on the division.
- **Flat, format-independent roster cap (`MAX_TEAM_ROSTER = 12`).** With no
  format there's nothing to derive a cap from, and "regardless of team size"
  means a small squad must still be able to enter a sixes division. 12 lets a
  club keep a deep bench to rotate across formats while guarding against
  runaway invite spam.
- **Hand-edited the generated Supabase types to match the drop migration.**
  Docker/local Postgres was down, so `gen:types` couldn't run. Removing
  `format` from the `teams` Row/Insert/Update by hand made typecheck the
  enforcement mechanism — every stale `teams.format` read became a compile
  error until removed. CI regenerates types on deploy.
- **Dropped the `/teams` format filter and the format-derived "recruiting vs
  full" chip.** The directory card showed `rosterCount/teamSize`, where
  `teamSize` was `playersPerSide(team.format)`. With no format there's no
  target size, so the card now shows a plain "N players" roster count.

## Changes

DB / types:

- New migration `20260911000000_drop_teams_format.sql` — `alter table
public.teams drop column format`. The `format` **enum** is untouched (events
  / divisions / brackets still use it). No view/RPC/RLS/index depended on
  `teams.format`.
- `packages/supabase/src/database.types.ts` — removed `format` from the `teams`
  Row/Insert/Update (hand-edited; see decision above).

Domain:

- `teams/team.ts` — removed the `format` field, constructor arg, and
  `create`/`rehydrate` params; `MAX_TEAM_ROSTER = 12` drives `maxRoster`;
  reframed the aggregate doc ("a named group of people… carries no format").
- `teams/team-queries.ts` — dropped `format` (filter + card) and the
  format-derived `teamSize` from the directory read model.
- `events/event-repository.ts` — dropped `format` from `TeamLite` and
  `CaptainedTeamLite`.

Application:

- `messages.ts` — `CreateTeamCommand` drops the `format` arg.
- `commands/team.handler.ts` — `CreateTeamHandler` drops `format`;
  `RegisterTeamHandler` no longer checks/needs format; removed unused
  `Format` / `ValidationError` imports; updated docs.

Infrastructure:

- `supabase-team-repository.ts` — TeamRow / select / rehydrate / save all drop
  `format`; removed `Format` import.
- `supabase-team-query-repository.ts` — drop `format` from select + filter and
  the `playersPerSide`-derived `teamSize`; removed `Format` / `playersPerSide`
  imports.
- `event-detail/mappers.ts` — `TeamJoinRow`, `ViewerTeamRow`,
  `mapRegisteredTeams`, `mapViewerCaptainedTeams` drop `format`; removed
  `Format` import.
- `supabase-event-repository.ts` — both `teams` selects (registered-teams join,
  captained-teams side-load) drop `format`.

Web:

- `teams/new/new-team-form.tsx` — removed the format `<select>` (and
  `FORMAT_LABEL` / `FieldError` / `fieldA11y` imports); copy now: "A team is
  just your group of players. You can sign it up for tournaments and leagues of
  any format."
- `teams/actions.ts` — dropped the format field + validation; `new
CreateTeamCommand(user.id, name)`.
- `teams/page.tsx` — removed the format filter control + `format` searchParam;
  card props drop format/teamSize.
- `teams/_components/team-card.tsx` — dropped the format label and the
  recruiting/full chip; shows "N players".
- `teams/[id]/page.tsx`, `…/_components/team-jsonld.tsx`,
  `…/opengraph-image.tsx` — dropped format from selects, labels, JSON-LD, and
  OG meta.
- `teams/_components/my-teams-panel.tsx`, `profile/page.tsx` — dropped `format`
  from the raw `teams` PostgREST selects (string selects typecheck can't catch
  — found via grep).
- `events/[id]/_components/tournament-signup-panel.tsx` — `RegisteredTeam` /
  `EligibleTeam` drop `format` (earlier pass also removed the format-locked copy
  and the `eventFormat` prop).

Tests:

- `team.test.ts` — `makeTeam` no longer takes a format; roster-cap suite
  asserts the flat `MAX_TEAM_ROSTER`.
- `team.handler.test.ts` — the old format-mismatch test is now "registers a team
  into a division of any format (teams carry no format)".
- `event-detail/mappers.test.ts` — team fixture drops `format`.

## Patterns observed

- **String PostgREST selects are a typecheck blind spot.** `.select('teams:…(…,
format)')` is just a string literal, so dropping a column won't fail the
  build at the call site — only the downstream cast does, and only if the field
  is actually read. After a column drop, grep for the column name in `from('<table>')`
  / `<table>:<table>!inner(` selects, don't trust typecheck alone. Two of these
  (`my-teams-panel`, `profile/page`) were caught only by the final grep sweep.
- **When the DB can't regenerate types, hand-edit the generated types as the
  ratchet.** Removing the column from the generated `Row` turns typecheck into
  the "did I get every reader" check. Pair it with a real drop migration so CI's
  regen is a no-op.
- **Conflated concepts hide in derived values.** `maxRoster` and the directory's
  `teamSize` both silently coupled "how many people are on this roster" to "what
  format do they play." Removing format forced both to stand on their own.

## Follow-ups

- **ADR 0013 is still "Proposed."** This bundle implements its core stance (team
  = durable, format-independent identity) for creation + registration. Worth
  promoting the identity decision to "Accepted" / amending it to record that a
  team carries no format. Offered to the user; not done unprompted.
- **No data backfill needed** — the column drop is destructive but the data
  (a single enum per team) was descriptive only and intentionally discarded.
