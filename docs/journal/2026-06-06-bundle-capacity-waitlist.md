# Capacity waitlist + auto-promotion (2026-06-06)

## Context

Phase 3a of the "wrap up outstanding items" plan — the highest-impact net-new
feature. A full fixed-capacity open-play event rejected the join
(`CapacityExceededError` → `?rsvp=full`) even though the UI advertised a
waitlist; the domain had no queue and no promotion, and `event.waitlist.promoted`
was a dead notification kind. Full design in [ADR 0036](../adr/0036-capacity-waitlist.md).

## Decisions

- **Waitlist lives in the `VolleyballEvent` aggregate** so join-when-full →
  enqueue and leave → promote-the-head are one atomic `save()`. A side-channel
  could promote out of order or double-grant a seat.
- **FIFO `_waitlist: UserId[]`.** `joinWaitlist` asserts the event is genuinely
  full (else "join directly"); `leave` runs `promoteFromWaitlist` (a `while`
  that promotes heads while `capacity.hasRoom` — normally one, but drains a
  backlog if the host raised capacity). New events: `WaitlistJoined`,
  `WaitlistLeft`, `WaitlistPromoted`.
- **Dedicated `event_waitlist` table, not an `event_participants` role.**
  Attendees are division-keyed; the queue is event-level. A separate table keeps
  the capacity trigger + roster reads clean and FIFO ordering (`created_at`)
  obvious. Reconciled by delta in `SupabaseEventRepository.save()` alongside
  attendees; hydrated head-first in `findById`.
- **Promotion runs on the admin client — and that's correct here.** The repo is
  already service-role (join/leave are app-authorized — the action passes the
  session user's own id). Promotion writes _another_ user's rows (delete their
  queue row, insert their attendee row); under RLS a user-scoped client couldn't
  (pitfall #8), but the admin path is the sanctioned one because the promotion is
  a system-decided side-effect, not a caller action. `event_waitlist` RLS
  (owner-or-host) is defense-in-depth.
- **`LeaveEventHandler` returns `{ promotedUserId }`.** The handler can't call
  `notify` (framework-free), so it reads the raised `WaitlistPromoted` before
  `save()` drains it and returns the id; the web `leaveEvent` action fires
  `event.waitlist.promoted` — finally lighting that kind (notifications P2 #2).
- **Viewer's queue position read on the admin client in the loader, gated to a
  full open play.** RLS hides the queue ordering from a non-host viewer, so the
  1-based position needs the full list; only the aggregate count + the viewer's
  own slot are surfaced, and only when `spotsRemaining === 0` (no extra query
  otherwise). Kept out of the domain read model to avoid threading a field
  through the query handler + infra read.

## Changes

- ADR 0036; migration `20260917000000_event_waitlist.sql` (+ hand-edited
  `database.types.ts`).
- Domain: `events.ts` (3 events), `volleyball-event.ts` (`_waitlist`,
  `joinWaitlist`/`leaveWaitlist`/`leave`-promotes, getters); +7 aggregate tests.
- Infra: `supabase-event-repository.ts` load + save reconciliation.
- Application: `JoinWaitlistCommand`/`LeaveWaitlistCommand` + handlers;
  `LeaveEventHandler` returns the promoted id; wired in `handlers.ts`; +4 tests.
- Web: `rsvp-actions.ts` (`joinWaitlist`/`leaveWaitlist` + promotion notify),
  `RsvpPanel` (Join/Leave-waitlist + "You're #N"), `EventSignupArea` + `page.tsx`
  - `load-event-detail.ts` (count/position), `event-rsvp-flash.ts` (2 codes).

## Patterns observed

- **A multi-row, cross-owner side-effect of a single-actor command belongs on
  the admin client (or a SECURITY DEFINER RPC), never a user-scoped client.**
  Promotion-on-leave is the third instance of pitfall #8's shape; here the repo
  was already admin, so it fell out for free — but it's the reason a waitlist
  can't be bolted onto an RLS-enforced write path.

## Follow-ups

- **Deploy-gated:** the migration + hand-edited types + the repo load/save +
  promotion path can't run in the local quad (no Docker). Verify on dev:
  join-when-full queues, leave promotes the head + the promoted user gets the
  `event.waitlist.promoted` ping, and "You're #N" renders. The Hannah persona
  e2e (`test.fixme`) can be un-fixmed after.
- **Paid events:** the queue is free open play first — a promoted user on a paid
  event would still owe payment (no checkout on promotion). Out of scope; the
  `joinWaitlist` path doesn't gate on paid yet, so a follow-up should either
  block waitlisting paid events or wire a pay-on-promotion flow.
- **Realtime spot-count** (live "spots left" / queue updates) deferred.
