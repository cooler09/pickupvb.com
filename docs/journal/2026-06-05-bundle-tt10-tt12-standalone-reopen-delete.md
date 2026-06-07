# TT-10 + TT-12: standalone bracket reopen + delete (2026-06-05)

## Context

Two standalone-bracket dead-ends from the 2026-06-05 bracket-tool audit
([tournament-tools-workflow.md](../audits/tournament-tools-workflow.md)):

- **TT-10 (P2)** — a **completed standalone bracket could never be re-opened**. The
  domain already had `Bracket.reopen()`, but no standalone command/action reached
  it and the board's only Re-open affordance (`LiveHostTools`) was
  `scope.kind === 'event'`-gated. A mis-entered final froze the bracket forever
  (`recordResult`/`resetMatch` reject once `completed`).
- **TT-12 (P2)** — the free-tier cap copy told users to "Finish or **delete** your
  current bracket", but **no delete path existed anywhere**. Combined with TT-9, a
  free owner could get fully stuck (format fixed at create, at the 1-bracket cap,
  no escape).

Picked up together because they're the pair that frees a stuck standalone owner.

## Decisions

- **Reopen mirrors the event handler, owner-gated.** `ReopenStandaloneBracketHandler`
  reuses `loadOwnedBracket` (owner check) instead of the host gate, then calls the
  existing `Bracket.reopen()`. No new domain behaviour — the gap was purely the
  missing standalone command + UI wiring.
- **Delete is a repository port, not aggregate behaviour.** Deletion removes the
  aggregate rather than transitioning it, so it's a `deleteBracket` port method
  (alongside `addBracketTeam` etc.), not a `Bracket` method. One
  `DELETE FROM event_brackets` suffices — `bracket_seeds` / `bracket_matches`
  (→ `bracket_match_sets`) / `bracket_teams` / `match_live_scores` all FK into
  `event_brackets(id)` with `on delete cascade` (verified in the migrations).
- **Owner gate scopes delete to standalone for free.** `DeleteStandaloneBracketHandler`
  loads via `loadOwnedBracket`, which rejects any bracket whose `ownerUserId` isn't
  the requester — an event bracket (`ownerUserId` null) can never be deleted through
  this path. No separate "is standalone" check needed.
- **DRY the Re-open strip across scopes.** Extracted `ReopenStrip` from
  `LiveHostTools` and drove it from a new `reopen` entry on `BoundBracketActions`
  (event → `reopenBracket`, standalone → `reopenStandaloneBracket`). The event-only
  Substitute / per-match Edit stay event-scoped — that's the larger TT-11, out of
  scope here.
- **Delete redirects to the list, not back to the (now-gone) bracket.** On success
  there's no bracket to return to; `deleteStandaloneBracket` `revalidatePath('/brackets')`
  - `redirect('/brackets')`. A two-step `<details>` danger zone gates the click
    (mirrors the board's Reset disclosure) — no JS confirm needed.

## Changes

- [bracket-repository.ts](../../packages/domain/src/brackets/bracket-repository.ts) —
  new `deleteBracket(bracketId)` port method.
- [supabase-bracket-repository.ts](../../packages/infrastructure/src/supabase-bracket-repository.ts)
  — `deleteBracket` impl (single cascade DELETE on the admin client).
- [standalone-bracket.handler.ts](../../packages/application/src/commands/standalone-bracket.handler.ts)
  — `ReopenStandaloneBracketCommand`/Handler + `DeleteStandaloneBracketCommand`/Handler.
- [handlers.ts](../../apps/web/src/lib/handlers.ts) — wired both into the composition
  root (`reopenStandaloneBracket`, `deleteStandaloneBracket`).
- [brackets/actions.ts](../../apps/web/src/app/brackets/actions.ts) — `reopenStandaloneBracket`
  (back with `notice=reopened`) + `deleteStandaloneBracket` (redirect to `/brackets`).
- [bracket-action-binding.ts](../../apps/web/src/app/events/[id]/bracket/_components/bracket-action-binding.ts)
  — `reopen` added to `BoundBracketActions` for both scopes.
- [board-view.tsx](../../apps/web/src/app/events/[id]/bracket/_components/board-view.tsx)
  — extracted `ReopenStrip`; render it for standalone + completed; `LiveHostTools`
  delegates its completed branch to it.
- [brackets/[id]/page.tsx](../../apps/web/src/app/brackets/[id]/page.tsx) — "Delete
  this bracket" danger zone (`errorButtonClass`).
- Tests: [standalone-bracket.handler.test.ts](../../packages/application/src/commands/standalone-bracket.handler.test.ts)
  +5 (reopen completed→active / non-owner reject; delete owned / non-owner reject /
  unknown NotFound). `deleteBracket` no-op added to the `bracket.handler.test.ts`
  fakes to satisfy the widened port.

## Patterns observed

- **Adding a port method ripples to every fake.** `BracketRepository` has three
  source implementers (the Supabase adapter + two test-file fakes, one with a
  subclass). Widening the interface means touching all of them or typecheck fails —
  cheap, but easy to forget the test fakes.
- **An owner/host gate can double as a scope filter.** `loadOwnedBracket` rejecting
  null-owner brackets means the standalone delete handler needs no extra "is this
  standalone?" guard — the authorization check already excludes event brackets.

## Follow-ups

- **TT-11** — the broader standalone draft + manual-edit parity (per-match Edit,
  Substitute, add/remove match, Edit pools, playoff re-seed). TT-10 unblocks the
  sharpest data-integrity case; TT-11 is the larger build. Tracked in
  [tournament-tools-workflow.md](../audits/tournament-tools-workflow.md).
- Consider a delete affordance on the `/brackets` list too (currently only on the
  detail page) — minor convenience.
