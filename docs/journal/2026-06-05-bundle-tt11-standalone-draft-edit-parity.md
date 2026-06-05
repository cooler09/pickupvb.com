# TT-11: standalone bracket draft + manual-edit parity (2026-06-05)

## Context

From the 2026-06-05 bracket-tool audit
([tournament-tools-workflow.md](../audits/tournament-tools-workflow.md), **TT-11**,
P2): standalone brackets (ADR 0025) had none of the division path's ADR-0032
tooling. Standalone `generate()` auto-published (no draft review), and every
live structural edit — per-match Edit, Substitute, add/remove match, Edit pools —
was `scope.kind === 'event'`-gated. A standalone owner could only seed, generate,
record, reset, and (since TT-10) reopen.

The user chose **full parity (draft → publish)** over "keep one-click live + add
edits", so standalone now matches the division flow exactly.

## Decisions

- **Drop auto-publish; standalone gets the real draft stage.**
  `GenerateStandaloneBracketHandler` no longer calls `bracket.publish()`, so
  generate lands in `draft` and the owner publishes explicitly — the same
  lifecycle as the event path. This is a user-facing flow change (was
  one-click-live), confirmed before building.
- **Scope-drive the UI, don't fork it.** Rather than duplicate `DraftWorkspace` /
  `MatchEditor` for standalone, both were parameterized on `BracketScope` and now
  resolve their actions through `bindBracketActions(scope)` — the same indirection
  the board/seeding views already use. The board's structural-edit gate dropped
  its `scope.kind === 'event'` check entirely; `LiveHostTools` / Substitute /
  per-match Edit became scope-agnostic. Net result: one code path serves both
  scopes, and the TT-10 special-case (a standalone-only `ReopenStrip`) collapsed
  back into the unified `LiveHostTools`.
- **Mirror handlers, share the branding helpers.** The 6 new standalone
  manual-edit handlers (publish / setPools / editMatch / addMatch / removeMatch /
  replaceEntry) are owner-gated twins of the event host-gated suite. The DTO
  branding helpers `buildMatchPatch` / `buildAddMatchInput` were promoted to
  exports rather than re-implemented. `seedPlayoff` was intentionally **not**
  added — the event path has no UI for it either (handler-only), so parity holds.
- **The new `draft` state forced watch-page correctness.** A reachable standalone
  `draft` made the watch page's unconditional `● LIVE` badge actively wrong, so
  gating it (LIVE on active, Final on completed) and adding a "not published yet"
  card came along as required correctness — which also closes the audit's
  standalone P3s TT-13 (badge), TT-14 (`targetScore` now passed to the board), and
  TT-15 (`draft` status label).

## Changes

- [standalone-bracket.handler.ts](../../packages/application/src/commands/standalone-bracket.handler.ts)
  — dropped auto-publish; 6 manual-edit commands + owner-gated handlers.
- [bracket.handler.ts](../../packages/application/src/commands/bracket.handler.ts)
  — exported `buildMatchPatch` / `buildAddMatchInput`.
- [handlers.ts](../../apps/web/src/lib/handlers.ts) — wired the 6 standalone handlers.
- [brackets/actions.ts](../../apps/web/src/app/brackets/actions.ts) — 6 standalone
  `*FromForm` actions mirroring the event ones.
- [bracket-action-binding.ts](../../apps/web/src/app/events/[id]/bracket/_components/bracket-action-binding.ts)
  — `publish` / `setPoolsFromForm` / `addMatchFromForm` / `editMatchFromForm` /
  `removeMatch` / `replaceEntryFromForm` on `BoundBracketActions`, both scopes.
- [match-editor.tsx](../../apps/web/src/app/events/[id]/bracket/_components/match-editor.tsx),
  [draft-workspace.tsx](../../apps/web/src/app/events/[id]/bracket/_components/draft-workspace.tsx)
  — parameterized on `BracketScope`.
- [board-view.tsx](../../apps/web/src/app/events/[id]/bracket/_components/board-view.tsx)
  — `canStructEdit` / `hostEdit` un-gated; `LiveHostTools` + `SubstituteTeamButton`
  scope-driven; TT-10's standalone `ReopenStrip` special-case removed.
- [bracket-workspace.tsx](../../apps/web/src/app/events/[id]/bracket/_components/bracket-workspace.tsx)
  — event call site passes `scope={eventScope(...)}`.
- [brackets/[id]/page.tsx](../../apps/web/src/app/brackets/[id]/page.tsx) — `draft`
  branch renders `DraftWorkspace`; board gets `teams` + `targetScore`.
- [brackets/[id]/watch/page.tsx](../../apps/web/src/app/brackets/[id]/watch/page.tsx)
  — `draft` card + LIVE/Final badge gating + `targetScore` (TT-13/14).
- [brackets/page.tsx](../../apps/web/src/app/brackets/page.tsx) — `draft` status
  label (TT-15).
- [standalone-bracket.ts](../../apps/web/tests/e2e/_helpers/standalone-bracket.ts)
  — helper clicks Publish after generate (draft→active).
- [standalone-bracket.handler.test.ts](../../packages/application/src/commands/standalone-bracket.handler.test.ts)
  — +7 cases (generate-lands-in-draft; publish ×2; editMatch ×2; addMatch;
  replaceEntry).

## Patterns observed

- **A scope indirection pays off at the third consumer.** The `BracketScope` +
  `bindBracketActions` seam (built for the read-only board) absorbed the entire
  manual-edit suite with zero new branching in the components — un-gating was
  literally deleting `scope.kind === 'event'` checks. When a second delivery
  surface reuses a component, routing actions through a binding beats threading
  `eventId`/`divisionId` everywhere.
- **A new reachable state ripples to every status switch.** Introducing `draft`
  to standalone meant the editor page, watch page, and list all needed a `draft`
  branch — the watch page's stale always-LIVE badge only became visibly wrong once
  the state was reachable. When you make a previously-unreachable enum value
  reachable, grep every `status ===` site.

## Follow-ups

- **TT-16** (per-pool advance feasibility in `generatePlayoff` / Edit-pools) and
  **TT-17** (double-elim grand-final reset) — both P3, in
  [tournament-tools-workflow.md](../audits/tournament-tools-workflow.md).
- The standalone e2e is deploy-gated (runs against dev); the Publish-step change
  is authored but not yet run green against a deployed build.
