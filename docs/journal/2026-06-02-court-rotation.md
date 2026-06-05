# Court rotation queue shipped; cost-split removed (2026-06-02)

## Context

The last of the three shared-multi-device roadmap tools. Live at
[`/tools/rotation`](../../apps/web/src/app/tools/rotation/page.tsx) — a
king-of-the-court next-up queue for open gyms. Same bundle removed the
**cost-split** tool: a per-cent bill splitter is low value when everyone has a
calculator on their phone (user call), so it earned its place less than the
others.

With this, every roadmap tool is resolved: scoreboard, bracket, team randomizer,
scheduler, seeding, match timer, and rotation are live; cost-split dropped.

## Decisions

- **Removed cost-split.** Deleted `app/tools/cost-split/` and its index tile +
  sitemap entry. The shared `roster.ts` lib it used is untouched (still backing
  the randomizer + seeding), so the removal was self-contained.
- **Rotation is the third `useRoomSync` consumer — zero new sync code.** The
  whole board (`courts` + `queue`) is broadcast last-write-wins via the shared
  room engine; `use-rotation-sync.ts` is an 18-line wrapper. Three consumers
  (scoreboard, timer, rotation) is the payoff for the
  [timer-bundle extraction](2026-06-02-match-timer-room-primitive.md).
- **Config in the room, not the URL.** The scoreboard/timer encode their small
  fixed config in the query string. Rotation's "config" is the roster — an
  unbounded list — so only the court count rides the URL; teams are added
  **in-room** into the synced state. A device opening the bare link catches up
  via the first broadcast.
- **In-chrome interactive board, not a full-screen takeover.** The
  scoreboard/timer are _displays_ (dark `fixed inset-0`, raw themed classes).
  Rotation is a _manager_ you poke at, so it renders inside the normal site
  chrome and uses the M3 button vocab (`primaryButtonClass` /
  `neutralButtonClass`) — staying inside the persona-ux ratchet rather than
  opting out the way a takeover surface does.
- **King-of-the-court model = auto-fill + winner-stays.** Pure `rotation.ts`:
  open court slots auto-fill from the front of the queue (court by court);
  `reportWin` keeps the winner, sends the loser to the back, and pulls the next
  team up. Deterministic, `now` injected — 13 unit cases pin the rotation
  invariants.

## Changes

- **Removed:** `app/tools/cost-split/` (4 files); its tile in `tools/page.tsx`;
  its `sitemap.ts` entry.
- **Rotation:** `rotation/_lib/rotation.ts` + `rotation.test.ts` (pure board +
  transitions), `rotation/_lib/use-rotation-sync.ts` (wraps `useRoomSync`),
  `rotation/_components/{setup-form,rotation-board}.tsx`, `rotation/page.tsx`
  (SEO landing), `rotation/[code]/page.tsx` (room, noindex).
- **Wire-up:** `tools/page.tsx` (rotation tile `soon` → `live`), `sitemap.ts`
  (+`/tools/rotation`), `robots.ts` (disallow `/tools/rotation/*` rooms).

## Patterns observed

- **The room engine has earned its keep at three consumers.** Adding a
  shared-state tool is now "write the pure state machine + an 18-line sync
  wrapper + a view" — no realtime code.
- **Config-in-URL vs config-in-room is a reusable decision rule.** Small fixed
  config (scoreboard target score, timer duration) rides the query string;
  list-shaped / unbounded config (a roster) lives in the synced state and is
  entered in-room.
- **Display vs manager picks the surface.** A tool that's _shown_ (scoreboard,
  timer) is a full-screen self-themed takeover with raw classes; a tool you
  _operate_ (rotation) stays in-chrome on the M3 vocab. Don't reach for
  `fixed inset-0` reflexively.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green; routes
`ƒ /tools/rotation` and `ƒ /tools/rotation/[code]` in the manifest; web suite
186 tests (+13 rotation).

- **Gotcha:** deleting a route (cost-split) left a stale `.next/types/app/tools/
cost-split/page.ts` that failed `typecheck` until a `build` regenerated the
  route-type manifest. When removing a route, run `build` before trusting
  `typecheck`.
- **Realtime not unit-testable:** rotation sync (add / report-win / court-count
  reflecting across devices, late-join catch-up) needs the same **two-device
  dev check** as the timer before it's "done".

## Follow-ups

- **`standings` is the only roadmap tool left.** It can sit on `useRoomSync`
  (live across a venue) or stay single-device — decide by whether shared entry
  matters. Pairs naturally with the scheduler's output.
- Rotation niceties, deferred: hand a court's matchup to the scoreboard tool,
  drag-to-reorder the queue, and a single-player vs team labeling toggle.
