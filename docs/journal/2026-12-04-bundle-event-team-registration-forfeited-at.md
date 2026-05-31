# 2026-12-04 — Bundle: `EventTeamRegistration.forfeitedAt` aggregate mirror

Follow-up slice on the event data model audit, closing the carry-over
"`EventTeamRegistration.forfeitedAt` wiring" follow-up from
[`2026-05-30-bundle-league-team-forfeit-ui.md`](2026-05-30-bundle-league-team-forfeit-ui.md).
That bundle shipped the host-facing affordance via the aggregate-light
`EventRepository.setRosterTeamForfeited` port + `BracketTeamLite`
read model — both of which deliberately bypass the
`EventTeamRegistration` aggregate (today's `findOneBy` filters
`.neq('source','roster')`, so league rosters aren't even visible to
it). This bundle mirrors the column onto the aggregate so the
round-trip surface is consistent across all three sources.

## Why this bundle

Two reasons it's worth doing ahead of the actual consumer:

1. **The aggregate is the public read+write contract.** Anything that
   loads a registration through `EventTeamRegistrationRepository`
   today silently drops `forfeited_at`. When the carry-over
   `source='roster'` filter loosening lands (separate follow-up), the
   port's writes would still be invisible to aggregate readers until
   this slice was done. Doing it now means that follow-up is a
   one-line filter change instead of a multi-file aggregate
   retrofit.
2. **Ad-hoc and walk-in entries can carry the column too.** The DB
   column was added without a `source` constraint; only the port
   restricts itself to `source='roster'`. The aggregate getter +
   `markForfeited` / `reinstate` mutators make that surface
   uniformly available, so a future "withdraw an ad-hoc team"
   affordance reuses the same shape.

No new UI ships in this slice. Aggregate-only.

## What shipped

**Domain.**
[`packages/domain/src/events/event-team-registration.ts`](../../packages/domain/src/events/event-team-registration.ts):

- `RehydrateEventTeamRegistrationProps` grew a required
  `forfeitedAt: Date | null` between `paymentNote` and `createdAt`.
  Required (not optional) so callers can't accidentally drop the
  field on a round-trip — the only existing call site is the infra
  repo, updated in the same slice.
- Constructor parameter + private field `_forfeitedAt`.
- `get forfeitedAt(): Date | null` getter. JSDoc notes it's
  orthogonal to payment status (a paid team can forfeit; a
  forfeited team's payment isn't auto-refunded).
- `markForfeited(at: Date)` — validates the Date (rejects
  non-`Date` and `NaN`-time via `InvariantViolation`), idempotent
  on already-forfeited (preserves the original timestamp), bumps
  `_updatedAt`.
- `reinstate()` — idempotent no-op on a non-forfeited team
  (doesn't bump `updatedAt`), nulls the field + bumps `updatedAt`
  otherwise.

**Infra.**
[`packages/infrastructure/src/supabase-event-team-registration-repository.ts`](../../packages/infrastructure/src/supabase-event-team-registration-repository.ts):

- `EntryRow` type grew `forfeited_at: string | null`.
- `save()`'s `entryRow` upsert payload writes
  `forfeitedAt ? toISOString() : null`.
- `findOneBy` select projection includes `forfeited_at`.
- The raw → `EntryRow` mapping and the
  `EventTeamRegistration.rehydrate({...})` call both pass the
  field through.

**Tests.**
[`packages/domain/src/events/event-team-registration.test.ts`](../../packages/domain/src/events/event-team-registration.test.ts)
gained a `describe('EventTeamRegistration forfeit lifecycle', …)`
block with seven cases covering: starts null, mark stamps + bumps
`updatedAt`, idempotent (preserves original timestamp), rejects
invalid Date, reinstate clears, reinstate-on-active is a no-op
(no `updatedAt` bump), orthogonal to payment status (paid + paid
team can still forfeit), and a `rehydrate` round-trip preserves a
non-null value. Test count for the file went 26 → 33.

## What did not ship

- **No new UI.** The host affordance for league teams is unchanged
  and still flows through the port (`setRosterTeamForfeited`) +
  `BracketTeamLite` reader. The aggregate surface is preemptive
  for ad-hoc/walk-in and for the day the `source='roster'` filter
  loosens.
- **No `findOneBy` filter change.** The repo still has
  `.neq('source', 'roster')` at L235. Loosening it is the other
  carry-over follow-up; doing it here would expand scope into a
  league-registration model unification, which the audit is
  tracking separately.
- **No `LeagueSchedule` integration.** The generator-side consumer
  of `forfeitedAt` (skip a withdrawn team when generating remaining
  weeks) still waits on the LeagueSchedule RPC.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` — 15/15
typecheck, lint at the existing 3 pre-existing warnings (unrelated
scoreboard files), domain suite passes including the 33-case
event-team-registration file (7 new), 8/8 build.

## Follow-ups remaining on the audit

- `LeagueSchedule` RPC (consumer of the forfeit flag).
- `EventTeamRegistrationRepository.findOneBy`'s
  `.neq('source','roster')` filter loosening, which will let the
  aggregate hydrate league rosters and unify the read paths.
