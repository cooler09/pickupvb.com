# Host-controlled registration-close window (2026-06-11)

## Context

Hosts wanted to "finalize" an event by closing registration before it starts —
manually, automatically 24h before, or on a configurable window. The event model
**already had** a `registration_closes_at` column and a host-editable
"Registration closes at" date picker (ADR 0006), **but it was enforced nowhere**:

- The domain signup methods (`joinAsPlayer`, `joinAsPlayerWithPosition`,
  `registerTeam`, `joinAsFreeAgent`, `joinWaitlist`) only gated on
  `status === Published` + `!hasStarted()`.
- The web `signupsOpen` gate
  ([load-event-detail.ts](../../apps/web/src/app/events/[id]/_loaders/load-event-detail.ts))
  ignored the close time entirely — it only fed a cosmetic "closing soon" badge.

So setting a close time did nothing. This bundle makes "registration closed" a
**real, enforced, computed predicate** and gives hosts three controls.

## Decisions

- **A computed predicate, not a new lifecycle status.** A closed event is still
  `published`/discoverable — it just stops accepting signups. Adding a 5th
  `EventStatus` would have rippled through RLS, search, the events view, CTA
  logic, and conflated the signup window with the lifecycle. Instead, two pure
  helpers (`isRegistrationClosed` / `effectiveRegistrationClosesAt`) are exported
  from [volleyball-event.ts](../../packages/domain/src/events/volleyball-event.ts)
  and consumed by **both** the aggregate (the real enforcement) and the web
  loader (the UI gate), so domain and UI can't drift.

- **Two new columns + a manual override** (full-control model, chosen with the
  maintainer over a leaner reuse-one-column option):
  - `registration_close_offset_minutes` — relative window ("close N hours before
    start", default 24h). Auto-follows if the host edits the start time.
  - `registration_override` — `'closed'` (force-close) / `'open'` (force-open
    until start) / `null` (follow schedule). The manual "Close now / Reopen /
    Resume schedule" toggle.
  - Existing `registration_closes_at` stays as the absolute option. A CHECK
    keeps absolute + relative mutually exclusive (`num_nonnulls(...) <= 1`).

- **Default stays "open until start."** 24h-before is a one-click preset, not
  forced — pickup players routinely sign up day-of, and existing events are
  unaffected (both new columns null → unchanged behaviour).

- **Precedence (single source of truth):** `override='closed'` → closed;
  `override='open'` → open until start; non-published → closed; started → closed;
  scheduled close reached → closed; else open.

- **The manual toggle mirrors `cancelEventAction`** (raw flag-flip on the
  user-session client, re-authorized via `canManage`) rather than threading a
  domain setter — the override is set at the write boundary like every other
  extension field, and the heavy logic (the predicate) lives in the domain. The
  edit-page schedule UPDATE intentionally does **not** touch `registration_override`,
  so editing the schedule never silently clears a host's "Close now" choice.

## What changed

- **Domain** — new extension fields + getters, the two pure helpers, an
  aggregate `registrationIsClosed(now)` getter, and a
  `if (this.registrationIsClosed()) throw new InvariantViolation(...)` guard
  added after the `hasStarted()` check in all five signup methods. Matrix tests
  in [volleyball-event.test.ts](../../packages/domain/src/events/volleyball-event.test.ts)
  (offset / absolute / override precedence + enforcement) — they fail without
  the guard.
- **Read model / infra / types / create handler** — the two fields threaded
  through `EventDetailReadModel`, `rowToExtensions` (covers both the aggregate
  hydration and the read-model spread), the `save_event` RPC payload, the
  `EventExtensionsSchema`, and `buildExtensions`.
- **Migration** —
  [20261012000000_registration_close_window.sql](../../supabase/migrations/20261012000000_registration_close_window.sql):
  adds the columns + CHECKs, **rebuilds `events_view`** (Postgres freezes a
  `select e.*` view's column list — the same trap documented on the
  20260611000000 / 20260605000000 migrations), and redefines `save_event` to
  persist them. Generated DB types hand-edited pending a post-deploy `gen:types`.
- **Web config UI** — the single date field in
  [event-advanced-details-panel.tsx](../../apps/web/src/components/event-advanced-details-panel.tsx)
  became a 3-way radio (When the event starts / N hours before start / specific
  date). The mode radio is the source of truth; the create + edit actions key off
  `registrationCloseMode` so only the active sub-input is honoured.
- **Web manual toggle** —
  [registration-window-actions.ts](../../apps/web/src/app/events/[id]/edit/registration-window-actions.ts)
  - a "Registration" panel on the manage dashboard
    ([registration-window-panel.tsx](../../apps/web/src/app/events/[id]/manage/_components/registration-window-panel.tsx)),
    shown only while the event is published and not started.
- **Web gate + display** — `registrationClosed` folded into `signupsOpen`, a
  "Registration closed" pill in the hero, the effective close time shown in the
  hero/meta "closes" line (so relative windows display, not just absolute), and a
  "Registration is closed" notice (host-only Manage link) in `EventClosedState`
  for the published-but-closed case that previously rendered silent `null`.

## Verification

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green (uncommitted).
The migration + RPC redefinition are deploy-gated (CI applies them); the
hand-edited `database.types.ts` is superseded by a post-deploy `gen:types` regen
from the dev project.

## Follow-ups

- Push/email notification when registration auto-closes (the close is computed
  lazily, not a cron event — would need a sweep to fire a notification).
- An e2e covering the close → CTA-disappears → reopen journey against dev
  (the domain matrix tests cover the rule; the click-path is unverified).
