# 2026-05-29 — Bundle: Phase 0 architecture guardrails (brand smart constructors + Onion-layer lint ratchets)

## Context

First phase of the architecture refactor scoped in the
[2026-05-29 architecture re-audit](../audits/architecture.md#reevaluation--2026-05-29).
Phase 0 is the "guardrails first" step: mechanical, low-risk changes that
create the safety rails the later structural phases (ProfileRepository,
GroupRepository, EventRepository split) lean on. It addresses audit finding
**P2-5** (114+ `as never` brand casts defeating the branded-id types) and
hardens the **verified-good** layer purity (ADR 0001) into an enforced lint
ratchet so it can't regress while the bigger refactors are in flight.

## Decisions

- **Chose a string-constrained `idConstructor<B>()` factory over hand-writing
  each constructor, and over reusing the existing generic `brand<B>()`
  helper.** `idConstructor` constrains input to `string` (so you can't
  double-brand or brand a non-string), and one factory keeps the 12 id
  constructors DRY. The pre-existing `brand<B>()` is generic over `T` — too
  loose for a smart constructor — and was unused; left it in place to keep the
  diff tight.
- **Co-located each `export const UserId = idConstructor<'UserId'>()` next to
  its `export type UserId`.** Type and value share a name (separate TS
  namespaces), so call sites write `UserId(value)` and existing
  `import type { UserId }` sites keep working untouched — web typechecks with
  zero edits.
- **Scoped the `as never` ban to domain + application only — not
  infrastructure.** Discovered during the sweep that infra's `as never` is
  overloaded: ~half are brand casts, but the rest are **Supabase
  write-payload casts** (`row as never` on `.insert/.upsert/.rpc`) — there's
  even an existing code comment noting they're temporary until
  `gen:types`. Banning `as never` in infra would conflate two unrelated
  concerns and break the build. The ban belongs where every `as never` is a
  brand cast: the pure inner layers.
- **Chose `events.findById(id)` (drop the cast) over `EventId(id)` for
  `findById` calls.** The `EventRepository.findById(id: string)` port takes a
  plain string and the value is already a string/brand, so the cast was
  spurious — dropping it is cleaner than constructing a brand only to widen it
  back to `string`. Construction is reserved for genuinely branded params
  (`findByDivisionId(DivisionId(...))`, `recordResult({ matchId: MatchId(...) })`).
- **Put the ratchet rules behind a shared `purityRatchet({ bannedImports })`
  helper in `@pickupvb/config`** rather than copy-pasting the rule blocks into
  each layer's config. Domain bans both outer layers (application +
  infrastructure); application bans only infrastructure (it may import domain).
- **Verified both ratchets actually fire** with throwaway probe files before
  finishing — a silent no-op ratchet is worse than none. `as never` → error,
  `@supabase/*` / `next` imports → error. Probes removed.

## Changes

Domain:

- `shared/brand.ts` — added the documented `idConstructor<B>()` smart-constructor
  factory.
- Added `export const <Id> = idConstructor<'<Id>'>()` next to each branded type:
  `EventId`/`UserId`/`TeamId` (`events/volleyball-event.ts`), `DivisionId`
  (`events/division.ts`), `BracketId`/`MatchId`/`EntryId` (`brackets/match.ts`),
  `CommunityListingId` (`community-listings/community-listing.ts`),
  `EventTeamRegistrationId`/`EventTeamRegistrationMemberId`
  (`events/event-team-registration.ts`), `EventTeamPaymentId`
  (`events/event-team-payment.ts`), `LeagueScheduleMatchId`
  (`leagues/league-schedule.ts`). 12 constructors total.
- `events/event-team-payment.test.ts` — the lone domain test cast
  (`'p1' as never as EventTeamPaymentId`) → `EventTeamPaymentId('p1')`.

Application (37 `as never` sites → 0):

- `commands/join-event.handler.ts` (5), `commands/bracket.handler.ts` (15 — incl.
  2 spurious `findById` casts dropped), `commands/event-team-registration.handler.ts`
  (8), `commands/create-event.handler.ts` (4),
  `commands/community-listing.handler.ts` (3), `commands/team.handler.ts` (1),
  `commands/event-division.handler.ts` (1), `commands/league-schedule.handler.ts`
  (1 spurious `findById` cast dropped). All migrated to smart constructors or
  cast-drops; import lines updated to value imports where needed.

Tooling:

- `packages/config/eslint.base.mjs` — new `purityRatchet({ bannedImports })`
  export (bans `as never` via `no-restricted-syntax`, bans outward/framework
  imports via `no-restricted-imports`).
- `packages/domain/eslint.config.mjs`, `packages/application/eslint.config.mjs`
  — apply `purityRatchet` with per-layer banned-import lists.

Docs:

- `docs/audits/architecture.md` + `docs/audits/README.md` — Phase 0 status,
  P2-5 partial-close note, the infra `as never` nuance.

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(lint 0 errors; pre-existing web `set-state-in-effect` warnings unchanged).

## Patterns observed

- **`as never` was hiding two different intents.** In the pure layers it's
  always brand laundering; in infra it doubles as a Supabase generated-type
  escape hatch. A blanket "ban `as never`" would have been wrong — the lesson
  is to scope a ratchet to the layer where the banned construct has exactly
  one meaning. Promoted the smart-constructor convention into
  `shared/brand.ts`'s JSDoc so it's discoverable at the definition site.
- **Spurious casts cluster around port signatures that take `string`.**
  Several `findById(x as never)` casts existed only because the surrounding
  code reflexively casts ids; the port already accepts `string`. Worth a grep
  when the EventRepository split (P2-2) lands and these signatures get
  branded.

## Follow-ups

- **Web + infrastructure `as never` (≈134 sites) not migrated.** Web is a mix
  of brand casts and Supabase update-payload casts; infra is mostly the
  latter. Migrate web brand casts opportunistically as those files move behind
  ports in Phases 2–4; the infra Supabase casts are a separate `gen:types`
  task. See [architecture.md P2-5](../audits/architecture.md#reevaluation--2026-05-29).
- **`apps/web` `supabase.from` boundary ratchet deferred.** Enforcing it now
  would need a 76-file grandfather baseline; instead it lands per-directory as
  each subdomain migrates behind a repository (Phases 2–4). The layer-purity
  import ban (this bundle) already protects the domain/application boundary,
  which was the higher-value, zero-violation ratchet.
- **Plain `as <Brand>` casts (e.g. `captainId as UserId`) left in place.**
  Out of scope for the `as never` ban; revisit if a broader "construct, don't
  cast" rule is wanted once command DTOs carry branded ids.
