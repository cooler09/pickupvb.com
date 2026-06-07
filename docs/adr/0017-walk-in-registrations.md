# 0017. Walk-in team registrations are a first-class registration source

- **Status:** Accepted
- **Date:** 2026-05-27
- **Amends:** [ADR 0007 — Per-team / per-player pricing](0007-per-team-per-player-pricing.md), [ADR 0008 — Team registration paradigm](0008-team-registration-paradigm.md), [ADR 0016 — Team registration mode is per-division](0016-per-division-team-registration-mode.md)

## Context

The [registration-workflow re-audit](../audits/registration-workflow.md)
finding **R4** (Bundle 117, 2026-05-27) recorded that walk-ins — teams
that show up on tournament day without a captain account and pay cash
at the table — were not modeled. The two existing paths both required
a real captain identity:

- **Captain-created ad-hoc** — captain self-registers from their
  phone via `AdHocTeamSignupPanel`. Requires a real (non-anonymous)
  account so `event_team_registrations.captain_id` can reference
  `profiles(id)`.
- **Host-proxy ad-hoc** — host registers a team on behalf of a
  captain via
  [host-team-registration-actions.ts](../../apps/web/src/app/events/%5Bid%5D/host-team-registration-actions.ts).
  The `actingAsHost` flag on `RegisterAdHocTeamCommand` bypasses the
  "one team per captain per division" uniqueness check, but the row
  still stores the host's `captain_id` — there is no way to attribute
  the team to its actual captain. The "Captain" line on the public
  roster reads as the host's name on every walk-in, which is
  misleading.

Bundle 119 (ADR 0016) already moved `team_registration_mode` onto
`event_divisions`, so ad-hoc and roster divisions can coexist on one
tournament. Walk-ins make sense only inside `ad_hoc` divisions —
roster divisions are pre-registered school teams, not same-day
sign-ups.

## Decision

### 1. Three registration sources, one table

`event_team_registrations` gains a `source text not null` enum column
(`'captain' | 'host' | 'walk_in'`) with default `'captain'`. The
default keeps existing self-signup writes unchanged; the host-proxy
path explicitly sets `'host'`; the new walk-in action sets
`'walk_in'`.

Three sources rather than two (`captain` + `host`) because the
audit trail matters — refund disputes and on-day reconciliation need
to know whether the host filled the form in for an absent captain
(`host`) or improvised the registration at the table for someone with
no account (`walk_in`). The pill on the public roster shows only
`walk_in` (the others render identically to existing rows).

### 2. Nullable captain identity for walk-ins

`captain_id` becomes nullable. Two new columns capture the freeform
identity for walk-ins:

- `captain_display_name text` — required when `source = 'walk_in'`,
  optional otherwise.
- `captain_phone text` — optional; the only way to reach a walk-in
  captain on a refund / scoring dispute later.

A check constraint enforces the discriminant:

```sql
check (
  (source = 'walk_in' and captain_id is null and captain_display_name is not null)
  or (source <> 'walk_in' and captain_id is not null)
)
```

Alternatives considered and rejected:

- **Synthetic anonymous profile.** Anonymous auth is already
  supported; we could mint a `profiles` row per walk-in. Rejected:
  every walk-in would litter `profiles` with a row that never logs
  in, has no email, and can't claim the registration later. The
  audit trail in the `event_team_registrations` row itself is more
  honest.
- **Single `captain_label` text column overloading `captain_id`.**
  Rejected: too easy to lose track of which rows have a real captain
  for the eventual "captain claims their walk-in" feature (deferred
  — see §6).

### 3. Walk-ins are ad-hoc-divisions-only

The new host action validates the chosen division is
`team_registration_mode = 'ad_hoc'` and throws
`InvariantViolation('walk-ins are only allowed in ad-hoc divisions')`
otherwise. Roster divisions stay captain-pre-pay-only; the bracket
slot in a roster division belongs to a pre-registered school team,
not a same-day sign-up.

### 4. Cash payment, no Stripe path

Walk-ins start at `payment_status = 'none'`. The host marks them
paid via the existing
`hostMarkTeamRegistrationPaid` action — which already writes a
synthetic `payment_intent_id = 'offline:host:<uuid>'` so the
`charge.refunded` webhook can't accidentally match. An optional
`payment_note text` column captures freeform reconciliation notes
("Venmo @captain", "five $20s, no change", etc.). No
`event_team_payments` row is created — that table is sidecar for
`roster` mode (ADR 0008 §3) and was never intended for off-platform
receipts.

Refunds of walk-ins go through the existing
`hostRefundTeamRegistration` action, which already special-cases
`offline:` payment intents and skips the Stripe call.

### 5. RLS allows host inserts on walk-ins

The current `event_team_registrations_insert` policy (rewritten in
Bundle 119) requires `auth.uid() = captain_id`. That check is
correct for `source = 'captain'` but blocks the host walk-in path.
The migration rewrites the policy to:

```sql
with check (
  (
    -- Captain self-signup (default path)
    source = 'captain'
    and auth.uid() = captain_id
    and exists ( … published event + ad_hoc division … )
  )
  or (
    -- Host proxy: 'host' (filling in for a real captain) or
    -- 'walk_in' (no captain account exists)
    source in ('host', 'walk_in')
    and exists (
      select 1 from public.events e
        join public.event_divisions d on d.event_id = e.id
       where e.id = event_id
         and d.id = division_id
         and e.status = 'published'
         and d.team_registration_mode = 'ad_hoc'
         and (auth.uid() = e.host_id or e.host_id in (
           select cohost_user_id from public.event_cohosts where event_id = e.id
         ))
    )
  )
)
```

The host walk-in path uses the admin client today (via the
`SupabaseEventTeamRegistrationRepository`) and so bypasses RLS, but
the policy still has to be correct so the same insert from a
user-context client (when we eventually flip the host actions to
respect RLS — deferred) doesn't regress.

### 6. UI surfaces the walk-in source

- **`TeamsRegisteredSection`** (public roster) — render a
  **"Walk-in"** pill next to the existing payment pill when
  `source = 'walk_in'`. Show `captain_display_name` (not the
  resolved profile name) for walk-ins.
- **`HostAdHocTeamsPanel`** — same pill on the host management row;
  the `Captain:` label uses `captain_display_name` and prints the
  phone number as a small secondary line so the host can call the
  walk-in captain later.
- **Receipt** — out of scope for walk-ins (there is no Stripe
  session and no per-team email flow yet).

A new **"Add walk-in team"** form is co-located on the host ad-hoc
panel. Required: division (constrained to `ad_hoc`), team name,
captain display name. Optional: captain phone, member roster.

### 7. Captain-claim is deferred

A future feature could let a walk-in captain log in and claim their
registration (set `captain_id` to their account, fill `member.user_id`
links). The data model supports it (just flip `captain_id` from
null to the user's id and recompute the `source`), but the UI is
out of scope for this bundle. The audit's R4 follow-up question
about "captain-replaceable identity" is answered yes — the schema
keeps it open — but no UI is wired.

## Consequences

### Positive

- The audit log on every registration row now records _who_
  created it (`source`), enabling dispute response without
  spelunking server logs.
- Walk-in attendees can be tracked end-to-end (registration →
  bracket → cash paid) without creating throwaway profile rows.
- The public roster gives viewers a clear "this team is still in
  flux" signal via the pill, matching the framing the host
  communicates verbally at the table.
- The host doesn't need to ask the walk-in captain for an email
  before adding them — friction at the table goes down.

### Negative

- Walk-ins do not currently receive payment receipts. If the host
  needs proof of payment for a walk-in, they have to handle it
  out-of-band (paper receipt, Square reader, etc.). Acceptable
  trade-off — Stripe Checkout requires a real customer email and
  walk-ins are precisely the case where the captain has neither.
- `captain_id` becoming nullable means every read path that
  resolves "Captain: X" must handle the null case (use
  `captain_display_name` as fallback). Existing code paths are
  enumerated and patched in the same bundle.
- The RLS policy gets more conditional logic. The complexity is
  contained to one policy and was inevitable as soon as we
  admitted three sources.

### Neutral

- The `source` enum is intentionally three values, not two. We
  could collapse `host` and `walk_in` since they're both
  host-initiated, but the audit-trail value of distinguishing
  "host filled in for an absent captain" from "host invented a
  team at the table" is higher than the complexity cost of a
  three-value enum.

## See also

- [ADR 0007 — Per-team / per-player pricing](0007-per-team-per-player-pricing.md)
- [ADR 0008 — Team registration paradigm](0008-team-registration-paradigm.md)
- [ADR 0016 — Team registration mode is per-division](0016-per-division-team-registration-mode.md)
- [Registration workflow audit — R4](../audits/registration-workflow.md#r4-p2--walk-ins-are-not-a-first-class-registration-type)
- Migration: [supabase/migrations/20260712000000_walk_in_registrations.sql](../../supabase/migrations/20260712000000_walk_in_registrations.sql)
- Bundle 120 journal: [docs/journal/2026-05-digest.md#bundle-120](../journal/2026-05-digest.md#bundle-120)
