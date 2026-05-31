# Event & profile media — Phase 1 (2026-05-30)

## Context

User feature request: video/livestreaming is central to the volleyball
community (clips, match VODs, livestreams), but the platform had no media
concept. Goal: let users attach **external** videos (we host nothing) to events
and profiles, with a per-event livestream list + host-featured stream, while
keeping the event detail page uncluttered for details-only viewers. Scope locked
with the user: all four providers (YouTube/Twitch embed inline; Instagram/
TikTok/Facebook link-card), dedicated `/events/[id]/media` sub-page + minimal
pill, any signed-in real user can post, **no voting awards this phase**. Full
rationale in [ADR 0024](../adr/0024-event-and-profile-media.md).

## Decisions

- **Mirrored the `community-listings` stack end-to-end** rather than inventing a
  pattern — same UGC-points-at-external-URL shape (moderation lifecycle, report
  - auto-hide trigger, short-code trigger, rate limit, anon-auth RLS).
- **`ExternalVideoUrl` VO parses; web layer builds embeds.** Kept embed-URL
  construction out of the domain (Twitch `parent=` is a web concern) — the VO is
  pure `provider + externalId + subtype`.
- **Twitch `parent` = static deploy-domain set**, not `headers()`, so the embed
  works inside the ISR-cached `/players/[id]` page.
- **Featured stream = partial unique index + host-gated `feature_event_stream`
  RPC** (clear-others-then-set, atomic). Feature-OFF is a single-row
  `unfeature()` through the aggregate.
- **After-report trigger is SECURITY DEFINER** — the one divergence from
  community-listings, which counts reports on the admin client. Media reports are
  filed on the user-scoped client (RLS gates insert), so the counter update needs
  DEFINER to fire on another user's post.
- **All media handlers run per-request via `getMediaHandlers()`** on a user-
  scoped client; `isEventHost` defers to the `is_event_host` SQL RPC so group
  co-hosts are covered, not just the primary host (AGENTS.md gotcha #8).

## Changes

- **domain** `packages/domain/src/media/`: `external-video-url.ts` (VO +
  provider parsing), `media-post.ts` (aggregate), `media-post-repository.ts`
  (port + read models), `index.ts`; barrel wired in `src/index.ts`. Tests:
  `external-video-url.test.ts`, `media-post.test.ts`.
- **types** `packages/types/src/media.ts`: `CreateMediaPostSchema` /
  `UpdateMediaPostSchema`; exported from index.
- **application** `commands/media-post.handler.ts` (create/update/remove/report/
  hide/unhide/feature/unfeature/end-stream), `queries/media-post-queries.handler.ts`
  (list event / list profile), message classes in `messages.ts`. Test:
  `media-post.handler.test.ts` (rate limit, auth branches).
- **infrastructure** `supabase-media-post-repository.ts` (mirrors the listing
  adapter; `featureEventStream` → RPC); index export.
- **migration** `20260820000000_media_posts.sql`: `media_posts` +
  `media_post_reports`, partial unique index, short-code/updated-at/after-report
  triggers, `feature_event_stream` RPC, RLS.
- **composition root** `apps/web/src/lib/handlers.ts`: `getMediaHandlers()`.
- **event detail footprint**: cached `loadEventMediaSummaryCached`
  (event-detail-cache.ts) → `mediaSummary` in the VM; `EventHero` `liveNow` pill;
  `EventMediaLink` card on `page.tsx`.
- **event media sub-page** `app/events/[id]/media/`: `page.tsx`, `actions.ts`,
  `_components/{add-media-form,media-card,media-sections}.tsx`.
- **shared** `components/video-embed.tsx` (safe first-party embeds),
  `components/profile-video-grid.tsx`.
- **profile videos**: public section on `players/[id]/page.tsx`; owner manage on
  `profile/page.tsx` via `_components/{my-videos-section,add-profile-video-form}.tsx`
  - `profile/media-actions.ts`.

## Patterns observed

- **`rounded-lg` is lint-banned** (M3 shape scale, Bundle 139) — use
  `rounded-shape-sm` (8px). Tripped every new component; already in AGENTS.md's
  M3 audit. `rounded-md`/`rounded-full` are fine.
- **`headers()` poisons ISR.** Any embed/host-dependent value on a cached page
  must come from a static source, not the request. Resolved by passing all
  Twitch parents.
- **SECURITY DEFINER is required for trigger-side counters when the triggering
  insert runs under RLS on a row the user doesn't own.** community-listings hid
  this by reporting on the admin client; media reports on the user client, so the
  divergence is load-bearing, not cosmetic.

## Verify

Standard quad green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
(542 unit tests pass; lint clean bar 3 pre-existing `remote-control.tsx`
warnings). **`pnpm db:migrate` + `gen:types` not run locally** — Docker/local
Supabase was down; the migration applies via CI on deploy (per AGENTS.md). The
infra adapter uses the `table()` any-cast and the app reads typed read models,
so typecheck/build don't depend on regenerated types. Manual sanity (post
YouTube/Twitch/Instagram, host-feature a stream, report → auto-hide, profile
display) should be run against dev once the migration lands.

## Follow-ups

- **Voting awards (best clip / biggest fail)** — deferred; needs real-account-
  gated anti-ballot-stuffing design. Own bundle.
- **Attach clip to a specific match** — `match_id` column reserved (nullable, no
  FK); wire UI once there's a single match target across bracket/league.
- **Provider-API live detection** — Phase 1 uses manual start/end + in-window
  heuristic; revisit if "ghost live" streams become a problem.
- **Run `pnpm db:migrate` + `gen:types`** locally (or confirm CI applied) and
  tighten the adapter's `table()` any-casts against the regenerated types.
