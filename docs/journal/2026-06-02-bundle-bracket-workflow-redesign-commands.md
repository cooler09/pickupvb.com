# Bracket workflow redesign — application commands (2026-06-02)

## Context

Phase 2 of the bracket redesign ([ADR 0032](../adr/0032-bracket-workflow-redesign.md)),
following the [domain foundation bundle](2026-06-02-bundle-bracket-workflow-redesign-domain.md).
The aggregate already exposes the manual-edit / lifecycle mutators; this bundle
adds the CQRS command/handler layer over them and wires it into the composition
root so the (forthcoming) UI can call them.

## Decisions

- **Eight host-gated, division-scoped commands**, mirroring the aggregate
  mutators: `PublishBracketCommand`, `ReopenBracketCommand`, `SetPoolsCommand`,
  `EditMatchCommand`, `AddMatchCommand`, `RemoveMatchCommand`,
  `SeedPlayoffCommand`, `ReplaceEntryCommand`. Each follows the existing
  generate/seed/reset shape: `loadHostBracket` (load + `assertHost`) → mutate →
  host-only `save` → `dispatchAnalyticsOutbox`.
- **Persist via the host `save`, not `saveAsMatchActor`.** Structural edits are a
  host privilege authorized in the application layer (`assertHost`), so the
  admin-client full-replace is correct — distinct from the captain-reachable
  match-result writes that must route through the RLS-gated RPC (AGENTS.md #8).
  A handler test pins this (the host repo fake's `saveAsMatchActor` throws).
- **Command DTOs carry plain strings; handlers brand the ids.** `EditMatchPatchInput`
  / `AddMatchInputDto` use `string` entry ids and `?`-optional keys;
  `buildMatchPatch` / `buildAddMatchInput` copy through only the keys the caller
  set (omitted ⇒ unchanged, `null` ⇒ clear) and brand entry ids to `EntryId`.
  This keeps the route boundary string-typed and the omitted-vs-null semantics
  intact under `exactOptionalPropertyTypes`.
- **Event scope only this bundle.** Standalone (ADR 0025) edit variants are
  deferred — the redesign's driving scenarios are event tournaments. The
  aggregate methods are shared, so adding owner-gated standalone handlers later
  is a thin repeat.
- **Auto-publish bridge stays.** The generate handlers still `publish()` after
  `generate()` — there is no UI Publish button yet (Phase 4), so removing the
  bridge now would render a blank `draft`. The `PublishBracketHandler` exists and
  is wired; the bridge comes out when the draft workspace ships.

## Changes

- **bracket.handler.ts** — 8 command classes + DTOs; 8 handlers; `loadHostBracket`
  helper; `buildMatchPatch` / `buildAddMatchInput` mappers. (`@pickupvb/application`
  re-exports via `export *`.)
- **handlers.ts** (composition root) — import + wire the 8 handlers onto the
  `handlers` object (`publishBracket`, `reopenBracket`, `setBracketPools`,
  `editBracketMatch`, `addBracketMatch`, `removeBracketMatch`, `seedBracketPlayoff`,
  `replaceBracketEntry`) on the admin-client `bracketRepo`.
- **bracket.handler.test.ts** — new `HostBracketRepo` (records `save`) + minimal
  `EventWriteStore` fake; suite covering publish-via-host-save, non-host →
  `UnauthorizedError`, missing bracket → `NotFoundError`, `editMatch` patch
  mapping (court + per-match bestOf), `setPools` id-branding.

## Patterns observed

- **Two repo fakes per aggregate now** — the captain-path fake (`save` throws,
  asserts `saveAsMatchActor`) and the host-path fake (`save` records). Pick by
  which authorization model the handler under test uses; mixing them hides the
  RLS-routing contract the existing tests protect.

## Follow-ups

- **Phase 3–5 UI** — server actions in
  [bracket/actions.ts](../../apps/web/src/app/events/[id]/bracket/actions.ts)
  calling these handlers, the setup/config form, the draft-editing workspace, and
  live-board inline edits. Drop the generate-handler `publish()` bridge when the
  Publish button lands.
- **Standalone edit variants** (owner-gated) if standalone brackets need the same
  manual edits.
- **gen:types** once the local DB is up (repo still reads `best_of`/`target_score`
  via an `as unknown` cast).

## Verify

Standard quad green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
(application 106 tests incl. the new host-gated suite; domain 479; infra 48;
web 214). Lint: 0 errors (pre-existing warnings only).
