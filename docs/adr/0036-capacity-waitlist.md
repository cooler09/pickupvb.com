# ADR 0036 — Capacity waitlist + auto-promotion for fixed-capacity open play

- **Status:** Accepted — implemented (2026-06-06; outstanding-items plan Phase 3a)
- **Date:** 2026-06-06
- **Supersedes:** the aspirational "Join waitlist" copy in `event-signup-area`
  (it framed a waitlist over a hard `CapacityExceededError`).

## Context

A full **fixed-capacity** open-play event rejected the join
(`JoinEvent` → `CapacityExceededError` → `?rsvp=full`). The signup UI already
_said_ "Full — join the waitlist below" and rendered a "Join waitlist" CTA, but
the action was a dead end (waitlist memory; persona Hannah). The domain had **no
capacity queue and no promotion**. (The `by_position` over-fill flag is a
different, positional concept and is unchanged.) The `event.waitlist.promoted`
notification kind was defined but never fired.

## Decision

Model the waitlist **inside the `VolleyballEvent` aggregate** so the
join-when-full → enqueue and leave → promote-the-head transitions are one atomic
unit persisted by `save()` — not a side-channel that could promote out of order
or double-promote.

- **Scope:** fixed-capacity, non-positional **open play** only. `joinWaitlist`
  rejects unlimited/positional events ("join directly"). Tournaments/leagues use
  team registration, not a player waitlist.
- **FIFO queue** `_waitlist: UserId[]`. `joinWaitlist` asserts the event is full
  (else "join directly"), no dup with attendees or the queue. `leaveWaitlist`
  removes by value. `leave` (attendee) promotes the head **while there is room**
  (normally one), moving it into `_attendees` and raising `WaitlistPromoted`.
- **New domain events:** `WaitlistJoined`, `WaitlistLeft`, `WaitlistPromoted`.
- **Storage:** a dedicated **`event_waitlist(event_id, user_id, created_at)`**
  table — event-level (open play is single-division, but the queue is the whole
  event's, not a division's), FIFO by `created_at`. RLS: a user manages their own
  row, the host reads all. Attendees stay in `event_participants`; the waitlist
  does **not** overload a participant role (keeps the capacity trigger + roster
  reads clean).
- **Promotion notification:** `leave` raises `WaitlistPromoted`; the
  `LeaveEventHandler` returns the promoted user id, and the web `leaveEvent`
  action fires `notify('event.waitlist.promoted', …)` — finally lighting that
  kind. (Web fires `notify`, per the established "actions call notify" pattern.)

## Consequences

- `joinAsPlayer` is unchanged — the web layer calls it first and, on
  `CapacityExceededError`, offers the real waitlist action. No silent behaviour
  change for events that aren't full.
- Promotion is best-effort-notified but **transactionally correct**: the spot is
  granted in the same `save()` as the leave; a missed notification never loses
  the seat.
- **Deferred:** realtime spot-count, waitlist for paid events (a promoted user on
  a paid event still owes payment — out of scope; the queue is free open play
  first), and the Hannah e2e (deploy-gated). Capacity _increase_ by host edit
  will promote on the next leave, not immediately (acceptable).
