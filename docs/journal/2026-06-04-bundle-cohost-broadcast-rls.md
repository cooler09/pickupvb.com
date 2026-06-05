# Co-hosts can broadcast to attendees now (2026-06-04)

## Context

Investigating the last "RLS decision" persona fixme — Steve (P3, co-host)
"co-host can send a host broadcast." It turned out to be a real UX bug, not just
a missing test, and broader than the fixme framed it.

## The inconsistency

A co-host reaches `/events/[id]/manage` (the edit/manage pages authorize the
same set `events_select` + `canManage` grant) and the `HostBroadcastPanel`
renders there. But the send goes through the **user-session** client
([broadcast-actions.ts](../../apps/web/src/app/events/[id]/broadcast-actions.ts)
inserts the row, then fans out via admin), so RLS decides — and
`broadcasts_insert_event_host` (20260524000000) gated on
`events.host_id = auth.uid()`, the **literal primary host only**:

```sql
with check ( audience_type = 'event_attendees'
  and exists (select 1 from events e where e.id = audience_id and e.host_id = auth.uid()) );
```

So a co-host could open the composer, write a message, hit send — and get an
RLS-rejection error. The UI offered an action the policy forbade. (Same for a
host-group admin, who also gets `canManage`.)

## Decision + fix

Two consistent resolutions: (A) extend the RLS so co-hosts can broadcast, or
(B) hide the panel from non-host managers. Chose **A** — every other co-host
write (edit, cancel, refund, bracket/league results) is already allowed, so
withholding _broadcast_ specifically was the odd one out; and broadcasts carry
no money, so there's no payout-routing concern (AGENTS.md Pattern 7 is
untouched). Confirmed with the maintainer before changing the policy.

Migration
[20260914000000_broadcasts_insert_co_hosts.sql](../../supabase/migrations/20260914000000_broadcasts_insert_co_hosts.sql)
delegates the insert check to **`public.is_event_host(audience_id)`** — the
existing SECURITY DEFINER manager predicate (host OR `event_co_hosts.host_user_id`
OR a co-host-group admin) that the bracket + league match-result RPCs already use
as their authz gate. So "who can broadcast" now matches "who can manage,"
through one shared helper rather than a fourth hand-rolled host/co-host check.

## Changes

- `supabase/migrations/20260914000000_*` — `broadcasts_insert_event_host` →
  `is_event_host(audience_id)`.
- `_helpers/co-hosted-event.ts` — optional `attendeeEmail` (seeds a division +
  one attendee so the panel renders, since `attendeeCount === 0 → null`), and a
  `eventBroadcastBySenderExists(eventId, senderId)` admin check.
- `persona-steve-cohost.authed.spec.ts` — the regression: Steve (co-host) sends a
  broadcast → the row lands under him (RLS allowed it) + no error alert. Fails
  against the host-only policy, passes once the migration applies.

## Decisions / notes

- **Used `is_event_host`, not the events_select inline branches.** It's the
  canonical SQL manager predicate; reusing it keeps the four manager-gated write
  paths (brackets, league results, … and now broadcasts) consistent. One caveat:
  `is_event_host` covers event co-hosts but **not** a primary-host-group admin
  (`canManage` does). For broadcasts that's fine — co-hosting via a group goes
  through `event_co_hosts.host_group_id`, which `is_event_host` _does_ cover. If a
  host-group admin (not a co-host) ever needs broadcast access, that's an
  `is_event_host` completeness question affecting brackets/leagues too, not a
  broadcast-specific patch.
- **Render gate left as-is.** The panel already shows to co-hosts; with the RLS
  fixed it now works, so no app change was needed (option A, not B).

## Follow-ups

- Apply the migration on dev before the Steve broadcast spec goes green
  (deploy-gated).
- Consider whether `is_event_host` should also grant primary-host-group admins —
  a separate, broader audit (it would affect bracket/league result writes too).
