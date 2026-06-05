# Match timer + shared room-sync primitive extracted (2026-06-02)

## Context

First of the three **shared multi-device** roadmap tools. Live at
[`/tools/timer`](../../apps/web/src/app/tools/timer/page.tsx). Unlike the four
pure-client tools, this one needs the scoreboard's Realtime room machinery — so
this bundle does the extraction the [roadmap](2026-06-01-host-tools-roadmap.md)
flagged ("the second multi-device tool is the signal to extract scoreboard's
`_lib` room/sync into a shared `_lib`") and builds the timer on top.

## Decisions

- **Extracted the generic room engine into `app/tools/_lib/`** — `room-code.ts`
  (already generic), `room-storage.ts` (a `createRoomStorage<T>(namespace)`
  factory: namespaced key prefix + 24h TTL prune), and `use-room-sync.ts`
  (`useRoomSync<T extends { version; updatedAt }>` — the broadcast channel,
  last-write-wins, late-join re-announce, presence/peer count). The timer is the
  **second consumer**, which is the extract trigger (same playbook as the roster
  lib).
- **Migrated the scoreboard onto it via faithful shims — zero call-site
  changes.** `scoreboard/_lib/{room-code,storage,use-scoreboard-sync}.ts` now
  re-export / wrap the shared primitives, preserving every existing export name
  (`useScoreboardSync`, `loadState`/`saveState`/`clearState`, the room-code
  fns). `scoreboard-view.tsx` and `remote-control.tsx` were untouched. The
  scoreboard namespace + localStorage prefix (`pickupvb:scoreboard:`) are
  unchanged, so in-flight games still load.
- **Synced timer = broadcast transitions, render from `endsAt`.** Only
  start/pause/reset/adjust travel over the channel (each bumps `version`); every
  device derives the live countdown locally from `endsAt - now`. No per-second
  broadcasts, no cross-device clock drift — the protocol stays identical to the
  scoreboard's. This is the core design choice.
- **Pure timer logic with an injected `now`.** `timer.ts` takes an explicit
  `now` (default `Date.now()`) on every transition, so it's deterministically
  unit-tested (10 cases) and `Date.now()` never runs in a render body. The view
  ticks a `now` state **only from timer callbacks** (`setTimeout`/`setInterval`),
  gated on `state.running`, with a `now === 0 → remainingMs` fallback for the
  first frame — so it avoids the `set-state-in-effect` warning the scoreboard
  view still carries.
- **Full-screen self-themed view.** Reuses the scoreboard's takeover-surface
  conventions (dark `fixed inset-0`, connection dot + peer count, wake lock, raw
  themed classes rather than the M3 button vocab — correct for a projector
  surface, and it sidesteps the persona-ux ratchet exactly as the scoreboard
  does). Share = copy the room link; no `/s/` alias (that's scoreboard-specific).

## Changes

- **Shared:** `app/tools/_lib/room-code.ts`, `room-storage.ts`,
  `use-room-sync.ts` — **new** generic room engine.
- **Scoreboard migration:** `scoreboard/_lib/room-code.ts` (re-export),
  `storage.ts` (`createRoomStorage('scoreboard')` + named re-exports),
  `use-scoreboard-sync.ts` (wraps `useRoomSync`). No component changes.
- **Timer:** `timer/_lib/timer.ts` + `timer.test.ts` (pure state + transitions),
  `timer/_lib/use-timer-sync.ts` (wraps `useRoomSync`),
  `timer/_components/{setup-form,timer-view}.tsx`, `timer/page.tsx` (SEO landing),
  `timer/[code]/page.tsx` (room, noindex).
- **Wire-up:** `tools/page.tsx` (timer tile `soon` → `live`), `sitemap.ts`
  (+`/tools/timer`), `robots.ts` (disallow `/tools/timer/*` rooms, allow the
  landing).

## Patterns observed

- **Wrapping behind faithful shims makes a shared-engine migration zero-churn
  for call sites.** The scoreboard's three `_lib` files became 4–12-line wrappers
  and nothing downstream moved — same shape as the `split.ts` re-export, scaled
  up to a stateful hook.
- **Synced clock = broadcast transitions, derive locally.** Any future shared
  time/score tool (rotation timers, shot clocks) should follow this rather than
  broadcasting ticks.
- **Ticking `now` without render impurity:** gate the interval on `running`,
  update `now` only from timer callbacks, and fall back to the stored
  `remainingMs` until the first tick lands. Keeps the React-Compiler purity rule
  _and_ the set-state-in-effect rule satisfied.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green; routes
`ƒ /tools/timer` and `ƒ /tools/timer/[code]` in the manifest; web suite 182
tests (+10 timer).

**Realtime is not unit-testable** and the verify chain only proves the code
compiles and the pure logic holds. Two things need a **two-device dev check**
against a deployed env before this is "done":

1. **Timer sync** — start/pause/adjust on one device reflects on another;
   late-joiner catches up via the presence re-announce.
2. **Scoreboard regression** — the migrated `useScoreboardSync` still syncs
   (the shim is behavior-identical, but the realtime path has no automated
   guard). Same dev-verify the chat/live-score realtime paths carry.

## Follow-ups

- **Two shared-state tools remain:** `rotation` (court queue) and `standings`.
  Both can now sit on `useRoomSync` — rotation is the natural next build; a
  single-device `standings` could even skip the room.
- Timer niceties, deferred: an audible/visible end-of-time alert (sound +
  full-screen flash beyond the current pulse), multiple named timers in one
  room, and a light/dark toggle like the scoreboard.
