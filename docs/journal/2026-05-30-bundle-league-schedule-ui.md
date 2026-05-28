# 2026-05-30 — League schedule composition root + host UI

**Bundle:** Closes the "composition-root wiring", "server actions", and
"host UI" follow-ups left open by the previous two league-schedule
bundles. Hosts can now manage a per-division weekly slate end-to-end
from `/events/[id]/schedule`.

## What shipped

- `apps/web/src/lib/handlers.ts` — composition root now instantiates
  `SupabaseLeagueScheduleRepository` and the four handlers
  (`addLeagueScheduleMatch`, `updateLeagueScheduleMatch`,
  `removeLeagueScheduleMatch`, `recordLeagueMatchResult`). The repo is
  also re-exported from `repositories` so the schedule page can read it
  directly (the existing pattern for bracket reads).
- `apps/web/src/app/events/[id]/schedule/actions.ts` — four server
  actions, all wired through the existing `requireRealUser` guard,
  typed-error `classify()` helper, and flash-param redirect pattern
  pioneered by the bracket actions.
- `apps/web/src/app/events/[id]/schedule/page.tsx` — server component.
  Validates `event.type === 'league'`, renders a division tab strip
  (when >1), groups matches by week, and gates the host forms on
  `event.canManage`.
- `apps/web/src/app/events/[id]/schedule/_components/match-row.tsx` —
  `AddMatchForm` + `MatchRow`. Each row is a read-only summary by
  default; the host sees a `<details>` with metadata-edit, record-result,
  and delete forms.
- Entry-point section on the event detail page mirroring the
  tournament "Bracket" section.

## Design choices

- **One route, three forms per row instead of separate edit/record
  routes.** Matches the existing bracket UX (everything host-facing
  hangs off the bracket page). The `<details>` collapse keeps the
  read-only view clean for guests-of-host who still see the schedule.
- **Update form omits scores.** The action only sends metadata; scores
  flow through `recordResultFromForm`. This matches the application
  handler's "preserve scores when omitted" behaviour and means a host
  re-dating a match can't blow away a captain-entered result by
  accident.
- **Team rosters reuse `bracketRepo.listRegisteredTeams`.** Both bracket
  and league pull from `event_team_entries` (source = 'roster'). No
  new port needed.
- **`event.canManage` (not raw `hostId === viewerId`) gates the host
  UI.** Picks up co-hosts for free; the application handler still
  re-checks via `assertHost`, which currently rejects co-hosts. Listed
  as a follow-up (see below) because the discrepancy will bite the
  first co-host who tries to add a match.

## Alternatives rejected

- **Client component with optimistic UI.** Would have needed
  `useFormState` + a `Result<T, DomainErrorCode>` return shape from each
  action. Defer until hosts ask for it; the flash-redirect pattern is
  what the rest of the host surface uses today.
- **One mega-form per week.** Considered, rejected: too much shared
  state to validate atomically without a custom RPC and a much heavier
  client component. Per-row forms compose with the existing helper
  patterns.

## Deferred follow-ups

- **Time-zone aware `datetime-local`.** Both the form and the server
  action treat submitted strings as UTC. The hosts will type a time in
  their head and see it round-tripped through UTC — wrong in any TZ
  other than the server's. Pick a date lib (date-fns-tz / Luxon) and
  parse against `event.timeZone`.
- **Co-host write access.** `assertHost` in the application handler
  rejects co-hosts even though the UI shows them the forms (because
  `event.canManage` is broader). Either widen the application check
  or narrow the UI gate.
- **Realtime refresh.** The migration already adds
  `league_schedule_matches` to `supabase_realtime`; a host watching
  the page while a captain enters a score should see it without a
  reload. Mirror `BracketRealtimeRefresher`.
- **Transactional `save()` via RPC.** The adapter still does
  delete-then-reinsert; a failure between the two leaves a wiped
  schedule.
- **Strict week contiguity + per-week team uniqueness** at the
  aggregate level (still parked).
- **Public spectator route.** The current page is public-readable but
  bundles the host forms in the same component. If guests start
  asking for a chrome-light view, split into `/schedule/watch`
  analogous to `/bracket/watch`.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` — green.
