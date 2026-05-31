# 2026-05-29 — Bundle: Phase 2b (increment 5) — follow-ups (escapeLike test + findCardById)

Cleared the tracked follow-ups from earlier increments.

## Part A — pin `escapeLike` with the first infrastructure test

`escapeLike` is the shared guard behind `searchCards` / `searchDirectory` — if
it regressed, a user typing `%` would match every profile. Exported it from
`supabase-profile-repository.ts` and added
`supabase-profile-repository.test.ts` (4 cases: `%`, `_`, every-occurrence,
no-op). This is the **first test in `packages/infrastructure`**, so it also
stands up the infra Vitest config (mirrors the domain/application configs).
The test imports only the pure helper — the adapter's `@pickupvb/supabase` /
`@pickupvb/domain` imports are type-only (erased at runtime), so no Supabase
client is needed. Total tests 309 → **313**.

## Part B — `findCardById` + drain the community claim read

Added `findCardById(id): Promise<ProfileCard | null>` to the port + adapter
(the by-id companion to `findCardByHandle` / `findCardsByIds`), and drained the
last clean single-profile read: the pending-claim block in
`community/[slug]/page.tsx` (`profiles_public.select('display_name').eq('id',
…)`). Kept it inside the existing `Promise.all` (the repo call returns a
promise) so the event + profile reads stay parallel; `claimantName` now reads
`claimantCard?.displayName`.

## Decisions

- **Export the pure helper to test it directly** rather than mocking the
  Supabase query chain — `escapeLike` is the logic worth pinning; the query
  builder is plumbing.
- **`findCardById` over `findCardsByIds([id])`** for the single read — clearer
  intent, and it's the natural third by-key accessor alongside handle/ids.

## Changes

- Domain: `users/profile-queries.ts` — `findCardById` on the port.
- Infra: `supabase-profile-repository.ts` — `findCardById` impl + `escapeLike`
  exported; new `vitest.config.ts` + `supabase-profile-repository.test.ts`.
- Web: `community/[slug]/page.tsx` — claim read → `findCardById` (in the
  existing `Promise.all`).

Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green
(**313 tests**; lint 0 errors). No DB change.

## Follow-ups (rest of Phase 2b, P2-1)

- **`load-event-detail.ts` profile reads** (captain-name batch via the admin
  client at L407; the host social-handles read at L705) — deferred: it's the
  999-LOC `unstable_cache` loader, so migrating its reads needs care around the
  admin client + cache context. Its own increment.
- **`friendships` reads**, then the **`profiles` writes** (→ expand the
  `UserProfile` aggregate). `GroupRepository` (Phase 3) + notification outbox
  still untouched.
