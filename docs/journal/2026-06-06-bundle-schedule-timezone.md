# League schedule: anchor match times in the event's time zone (2026-06-06)

## Context

Second quick-win of the "wrap up outstanding items" plan. The league schedule
actions parsed a host's `datetime-local` input with `new Date(raw)`, which on a
UTC server (Vercel) interpreted the venue-local wall-clock as UTC — the same
"9 AM stored as a different instant" class of bug the community importer already
fixed. The code carried a `// Converting against the event's time zone is a
follow-up` note; this closes it.

## Decisions

- **Reuse `zonedWallClockToUtc`** ([lib/timezone.ts](../../apps/web/src/lib/timezone.ts))
  rather than a second conversion path. It's the exact helper the community
  importer uses and is already exhaustively tested in `timezone.test.ts` (zones,
  DST, null/unknown fallback, seconds, unparseable). `parseScheduledAt` is now a
  thin wrapper over it, so no redundant action-level test is added.
- **Read the event's zone via `getEventBracketMeta`**, the same query the
  schedule page already uses to render `event.timeZone`. This keeps the action
  and the page agreeing on the zone with no new Supabase read path, no form
  plumbing, and no component changes. A failed read falls back to `null` → UTC
  wall-clock (the old behaviour), so the mutation never blocks on it.
- **One zone read per mutating action** (add / generate / update). Host actions
  are low-frequency, so the extra meta read is acceptable versus threading
  `timeZone` through the workspace + every form binding.

## Changes

- `apps/web/src/app/events/[id]/schedule/actions.ts` — `parseScheduledAt(raw,
timeZone)` now delegates to `zonedWallClockToUtc`; new `loadEventTimeZone`
  helper; `matchInputFromForm` takes `timeZone`; `addMatchFromForm`,
  `updateMatchFromForm`, and `generateScheduleFromForm` load and pass it.

## Patterns observed

- **Display stays viewer-zoned.** The instant is now stored correctly; the
  schedule still renders via `<LocalDateTime>` in the viewer's browser zone —
  the same semantics as event start times elsewhere. Showing the venue-zone
  wall-clock specifically (for an out-of-zone host) is a separate display
  concern, not in scope.

## Follow-ups

- None. The single behavioural change is covered by the existing
  `zonedWallClockToUtc` suite.
