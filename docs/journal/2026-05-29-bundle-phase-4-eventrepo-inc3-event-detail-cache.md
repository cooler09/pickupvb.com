# Phase 4 (EventRepository) inc. 3 — event-detail read-path consolidation (P2-6) (2026-05-29)

## Context

Third and final increment of the roadmap's structural Phase 4. Attacks **P2-6**
([architecture.md](../audits/architecture.md)): "one page's data" for
`/events/[id]` was spread across three layers — the infra read model
(`getDetail`), ~10 `unstable_cache` helpers, and ad-hoc admin reads — inside a
**999-LOC** [load-event-detail.ts](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts),
with scattered `event:{id}` tag bookkeeping (the same magic string copy-pasted
across the loader **and 9 mutating-action files**) and a `reviveEventDetailDates`
serialization workaround.

(See [inc. 1](2026-05-29-bundle-phase-4-eventrepo-inc1-isp-split.md) for the
"Phase 4 (EventRepository)" naming note vs. the notification "Phase 4" track.)

## Decisions

- **Rejected the audit's literal Fix ("move caching into an application-layer
  `GetEventDetailHandler` / infra read services").** `unstable_cache` is a
  `next/cache` primitive, and `@pickupvb/application` is framework-free by the
  Phase-0 purity ratchet (`next` imports are a hard ESLint error there). Next
  caching **cannot** move inward without breaking the hexagonal boundary. So the
  consolidation keeps caching in the web layer — where it legitimately lives —
  but gathers it into **one module** instead of scattering it through the page
  loader. (`GetEventDetailHandler` already owns the read-model _composition_;
  what it can't own is the Next cache wrapper.) Same shape as the inc. 2
  deviation: honour the finding's intent, not a layer-violating literal reading.
- **New `_loaders/event-detail-cache.ts`** (375 LOC) holds every
  `unstable_cache`-wrapped side-load (`loadEventReadModelPublic` + the
  `reviveEventDetailDates` hack, `loadEventPricingCached`,
  `loadEventTipTotalCached`, `loadPrimaryHostSocialCached`,
  `loadHostStripeReadyCached`, `loadAdHocPublicRowsCached`, `loadAdHocRowsCached`,
  `loadHeroImageCached`, `loadEventSponsorCached`) + the ad-hoc row types +
  `EventSponsorView`. `load-event-detail.ts` shrank **999 → 625 LOC** and is now
  the orchestrator: read-model load (viewer-aware vs. cached-public), two
  side-load waves, view-model assembly, and the _non-cached_ per-request helpers
  (`loadEligibleTeamsByDivision`, `loadLeagueTeamsByDivision`, `loadAdHocBundle`,
  `loadAttendeePayments`, `loadViewerPaymentStatus`, `buildCta`). All
  `unstable_cache` usage now lives in exactly one file.
- **Centralized the tag contract in `@/lib/cache-tags`** (`eventCacheTag`,
  `profileCacheTag`, `hostStripeCacheTag`). The tag string is the contract
  between the cache site and every `updateTag(...)` eviction site; it was a
  magic string in **~25 places**. Both sides now import the builder, so a typo
  can't silently break read-your-own-writes. Adopted at all **16 eviction
  sites across 9 action files** (`event-detail-cache.ts` cache sites + the
  ad-hoc / walk-in / co-host / league-team / host-team-registration / edit /
  cancel / sponsor actions + `_actions/hide-broadcast.ts`). This is the heart
  of the "scattered tag bookkeeping" finding — centralize _and_ adopt, or it's
  net worse (a second source of the same string).
- **Kept `reviveEventDetailDates`** (co-located with the only cache that needs
  it). It's inherent to caching a `Date`-bearing read model through
  `unstable_cache` (JSON flattens Dates to ISO strings); it can't be "killed"
  without removing `unstable_cache` from that path. Documented as such.
- **Re-exported `loadEventReadModelPublic` + `EventSponsorView`** from
  `load-event-detail.ts` so `page.tsx` (generateMetadata) and the view-model
  consumers keep their import paths — zero churn at those call sites.
- **No new tests.** Pure structural move + a mechanical magic-string→helper
  rename; no behaviour, no domain rule. The tag builders are trivial string
  fns (testing them is noise); the cached loaders are I/O wrappers exercised by
  the existing e2e/page paths.

## Changes

- **Web (new)** — [lib/cache-tags.ts](../../apps/web/src/lib/cache-tags.ts) (18
  LOC) + [events/[id]/\_loaders/event-detail-cache.ts](../../apps/web/src/app/events/%5Bid%5D/_loaders/event-detail-cache.ts)
  (375 LOC).
- **Web** — [load-event-detail.ts](../../apps/web/src/app/events/%5Bid%5D/_loaders/load-event-detail.ts):
  removed the cached side-loads + `EventSponsorView` + ad-hoc row types (now
  imported / re-exported); 999 → 625 LOC.
- **Web** — adopted `eventCacheTag(eventId)` at 16 `updateTag` sites in 9 files:
  `events/[id]/{ad-hoc-team,walk-in-team,co-host,league-team,host-team-registration}-actions.ts`,
  `events/[id]/edit/{actions,cancel-actions,sponsor-actions}.ts`, and
  `_actions/hide-broadcast.ts`.
- **No change** to the infra read model, the application handler, the domain
  port, or any cache key / revalidate window / tag string (byte-for-byte the
  same runtime behaviour — only the source location of the tag literal moved).

## Patterns observed

- **A Next cache primitive can't be pushed below the web layer.** When an audit
  says "move caching into application/infra," check the layer ratchet first:
  `unstable_cache` / `revalidatePath` / `updateTag` are `next/*` and must stay
  in `apps/web`. The achievable win is _consolidating within_ the web layer +
  delegating the pure composition inward (which the app handler already does).
- **A cache tag is an API between two files — give it one owner.** Any time a
  tag string appears at both a cache site and an eviction site, the literal is a
  silent contract. A one-line `xCacheTag(id)` builder imported by both ends
  removes the drift class entirely. Promoted to AGENTS.md (pitfall #1).

## Follow-ups

Phase 4 (EventRepository) is now **structurally complete** (P2-2 ISP split,
P2-3 getDetail mappers, P2-6 read-path consolidation). Remaining, lower-priority:

- **P2-6 design call (deferred, as the audit itself flagged):** the god
  `EventDetailReadModel` (~80 fields) still serves every surface
  (open-play / tournament / league / external). Per-surface read models or a
  discriminated union keyed on `registrationMode`/`type` is a larger redesign,
  not worth it until a surface's field set diverges enough to hurt.
- **P2-3 leftover (optional):** the same pure-mapper treatment for the adapter's
  still-large `save`/`search` paths if they grow (→ `event-row-mappers.ts`).
- Phase 5 (opportunistic): P2-4 outbox decision, P3-1/P3-2/P3-3/P3-4.

## Verify

Standard quad green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
(domain 267, application 42, web 55, infra 23; lint 0 errors, pre-existing
warnings only; build 8/8). No DB change.
