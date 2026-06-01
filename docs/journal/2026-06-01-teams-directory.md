# Teams directory: roster signal + read-side port (TM-1…TM-4) (2026-06-01)

## Context

Shipped all four findings from [teams-page-ux.md](../audits/teams-page-ux.md),
the third Connect directory. Like `/groups` it was already well-built (no
P1/P2) — this bundle is the roster-recruiting signal + convergence with the
sibling directories' read-port and field-vocab patterns.

## Decisions

- **TM-4 first — extract the port, then everything else lives in it.** `/players`
  and `/groups` read through `ProfileQueries`/`GroupQueries` ports, but the teams
  discover read was a raw `supabase.from('teams')` query inline in the page plus
  an inline captain-name resolution. Extracting `TeamQueries.searchDirectory` +
  `SupabaseTeamQueryRepository` gave the read a home, a test seam, and — crucially
  — the right place for TM-1's roster counts and the captain hydration
  (adapter-composes-`SupabaseProfileRepository`, the same idiom
  `SupabaseGroupQueryRepository.listMembers` uses). Chose the full port over the
  audit's "keep it inline + add the count" alternative because the user asked for
  all findings and the port is the convergence the audit wanted.
- **TM-1 — `rosterCount` vs `teamSize`, not a raw count.** "12 members" means
  nothing on a doubles team; "3/4" instantly reads as recruiting. `teamSize` comes
  from the domain's existing `playersPerSide(format)` (doubles=2 … sixes=6);
  `rosterCount` = active `team_members` (anon-safe, RLS `using (true)`) +
  `teams.extra_member_count` (off-site players). The chip shows
  "N/size · Recruiting" (emerald) while under size, else "Full" (muted) — the
  fraction is only shown while it's actionable, so a 6-on-a-quad team reads
  "Full" not a confusing "6/4".
- **TM-2 — a `<select>` takes `fieldInputClass` cleanly.** No separate
  field-select recipe needed (and the CC-2 ratchet only bans local
  `const selectClass` declarations, not reusing the shared input class). Both the
  search input and the format select adopt `fieldInputClass`; `sm:items-center`
  on the row absorbs its label-oriented `mt-1`.
- **No follow/join-from-directory.** Deliberately absent (PL-2/G-2 have no analog)
  — team rosters are captain-invite-only (`AddTeamMember`), so the directory is
  correctly pure discovery. Recorded so a future reader doesn't "add a follow
  button for consistency."

## Changes

- [team-queries.ts](../../packages/domain/src/teams/team-queries.ts) — new
  `TeamQueries` port + `TeamDirectoryCard`/`Query`/`Page`; exported from
  `teams/index.ts`.
- [supabase-team-query-repository.ts](../../packages/infrastructure/src/supabase-team-query-repository.ts)
  — new adapter (search + `countActiveMembers` + captain hydration + roster
  projection); exported from the infra index.
- [team-card.tsx](../../apps/web/src/app/teams/_components/team-card.tsx) —
  optional `rosterCount`/`teamSize` props + the Recruiting/Full chip.
- [teams/page.tsx](../../apps/web/src/app/teams/page.tsx) — uses the port,
  field-vocab form, header count; dropped the inline query + `SupabaseProfileRepository`.

## Patterns observed

- **Port boundaries keep DB-enum types out of the domain — cast at the adapter.**
  `TeamDirectoryQuery.format` is a plain `string` (the domain port shouldn't
  import the generated Supabase enum), so the adapter casts `format as Format`
  for the strongly-typed `.eq('format', …)`. The mid-build typecheck failure was
  exactly this: a plain `string` into a column typed as the format enum. Keep the
  port string-typed; cast at the SQL edge.
- **The three Connect directories are now structurally aligned:** read-side
  `searchDirectory` port → shared card with a decision-signal projection → (for
  followable entities) a follow-island. A future fourth directory has a clear
  template; the follow-island is the one piece worth generalizing if it recurs
  (noted in the players/groups journals).

## Follow-ups

- **`MyTeamsPanel`** could opt into the roster chip (it builds its own
  `TeamCardData`); a small enhancement, not done here.
- **`/teams/[id]`** (team detail) and `MyTeamsPanel` internals remain un-audited.
- **Generic follow-island** if a fourth followable directory lands (players +
  groups are the two instances today).
