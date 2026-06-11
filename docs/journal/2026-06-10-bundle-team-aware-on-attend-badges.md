# 2026-06-10 — Team-aware on_attend host badges (badges audit BA-9)

## Why

A maintainer attended a team tournament that had a custom host badge ("Test
badges 2026", `grant_rule = on_attend`) and never received it. Troubleshooting
against dev (event `dd1fa3ba-78e8-4052-859c-18c41aff8a8f`) traced it to a
structural gap, not a data glitch.

The on_attend auto-grant RPCs (`grant_attended_event_badges`,
`grant_attended_badges_for_event`, added 20260903000000 / 20261010000000) decide
"who attended event X" by joining **only** `event_participants` with
`role = 'attendee'`. That row exists for **open-play individual signups** and
nothing else:

- **Team events** (every tournament and league) register teams into
  `event_team_entries` (+ `event_team_entry_members`, + the entry `captain_id`).
  No `event_participants` row is written. Leagues use the same tables
  (`league_schedule_matches.home_entry_id`/`away_entry_id` → `event_team_entries`).
- **Free agents** sit in `event_participants` but with `role = 'free_agent'`,
  excluded by the `= 'attendee'` filter.

So on_attend host badges silently granted to nobody on any team event, and to no
free agent. The dev probe was unambiguous: the division had 4 `event_team_entries`
and **0** `event_participants` rows, and `user_badges` held 0 grants of the
badge. The reconcile cron's candidate query had the same `event_participants`/
`attendee`-only blind spot, so the nightly safety net couldn't cover for it.

Graded **P1** in [docs/audits/badges.md](../audits/badges.md#ba-9-p1--on_attend-grants-are-blind-to-team-events-and-free-agents)
— a host-facing Pro feature that was dead for the majority of events (tournaments
dominate the dataset: 507 tournament / 17 open_play / 8 league on dev).

## What changed

Migration
[20261011000000_on_attend_badge_grants_team_aware.sql](../../supabase/migrations/20261011000000_on_attend_badge_grants_team_aware.sql)
centralizes "attended event X" in one helper and rewires all three readers to it:

- **`event_attendee_ids(uuid)`** — new SECURITY DEFINER helper, the single source
  of truth: the union of
  - (A) `event_participants` role in (`attendee`, `free_agent`),
  - (B) rostered team members with an account (`event_team_entry_members.user_id`),
  - (C) team captains with an account (`event_team_entries.captain_id`),
    excluding soft-deleted entries (`deleted_at`) and account-less rows
    (`user_id`/`captain_id` null — walk-in teams the host typed in have no user to
    award).
- **`grant_attended_event_badges(uuid)`** — `create or replace` (return shape
  unchanged, so no drop needed). Encodes the _same_ A∪B∪C union in the
  **user→events** direction (a CTE starting from the user's own memberships) so
  the profile-view hot path stays index-friendly rather than computing every
  attendee of every badged event. A header comment flags that the two directions
  must stay in sync.
- **`grant_attended_badges_for_event(uuid)`** — now grants via
  `event_attendee_ids` (event→users).
- **`badge_reconcile_candidate_ids(since, now)`** — new; every attendee of an
  event finished in the window. The reconcile cron
  ([route.ts](../../apps/web/src/app/api/badges/reconcile/route.ts)) now builds
  its attendee candidate set from this RPC, so team members who never revisit
  their profile collect via the nightly run.
- Generated types hand-edited for the two new functions (regen on next
  `gen:types`).

### Free agents — included, deliberately

The badge already treats _registration_ as the attendance proxy: an open-play
attendee earns it on signup, with no verified check-in. A free agent made the
same commitment, and one who gets picked up becomes a team member who'd earn it
anyway — so excluding the pool would produce the odd "played pickup, no badge."
Including `free_agent` is the consistent choice. Strict mode (only granted, on a
team they actually played for) is a one-token change: drop `'free_agent'` from
the role filter in both the helper and the user→events CTE.

### Coverage after the fix

| Event type              | Attendee source                            | Before | After |
| ----------------------- | ------------------------------------------ | ------ | ----- |
| Open play               | `event_participants/attendee`              | ✅     | ✅    |
| Free agents (any event) | `event_participants/free_agent`            | ❌     | ✅    |
| Tournament teams        | `event_team_entries` (+ members + captain) | ❌     | ✅    |
| League teams            | same `event_team_entries` tables           | ❌     | ✅    |

## Alternatives rejected

- **Materialize `event_participants` rows for team registrants.** Would touch
  every team-signup path (ad_hoc / roster / walk_in / league / host-added) and
  the payment/forfeit lifecycle, with double-counting risk against the existing
  team tables. The grant is a read concern; fixing it at the read boundary is far
  smaller and can't corrupt registration state.
- **Duplicate the union into the cron's TypeScript.** Rejected for DRY — three
  readers (two grant RPCs + cron) would each carry their own copy of the
  "attended" definition and drift. One SQL helper keeps them honest.

## Verification

- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — green.
- The grant logic is SQL-resident, so there is **no domain/application unit-test
  surface** (existing badge unit tests cover the TS catalog + reconcile handler,
  not the grant SQL). Post-deploy, verify against dev with this probe (service
  role), which should flip from 0 → ≥1 grant for the troubleshooting event once
  its `ends_at` has passed:

  ```sql
  -- who does the helper now count as having attended the event?
  select * from public.event_attendee_ids('dd1fa3ba-78e8-4052-859c-18c41aff8a8f');
  -- backfill + read the grants
  select public.grant_attended_badges_for_event('dd1fa3ba-78e8-4052-859c-18c41aff8a8f');
  select user_id, badge_key from public.user_badges
   where badge_key = '86153111-8617-49f2-aaaf-73fe1d770d88';
  ```

  Note the event must satisfy `ends_at < now()` — at troubleshooting time it
  ended ~21h in the future, an _independent_ reason the grant hadn't fired yet.

## Follow-ups

- **e2e** (deploy-gated, not yet authored): register a team to an event, end it,
  hit reconcile, assert the captain/member holds the badge. The durable
  regression guard for SQL-resident grant logic — see the testing notes in
  AGENTS.md ("Playwright is for did-the-user-get-what-they-wanted").
- `badge_reconcile_candidate_ids` returns the raw union; the cron dedupes and
  caps to `MAX_CANDIDATES_PER_RUN` in TS. If the 7-day attendee set ever grows
  large in prod, push a `limit` into the RPC.
- Regenerate `database.types.ts` from the deployed schema after this migration
  ships (replaces the two hand-edited entries).
