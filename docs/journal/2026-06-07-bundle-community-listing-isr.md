# Community listing (`/community`): cacheable + own-hidden recovery (2026-06-07)

## Context

Performance audit **P3 #17**, the companion to the same day's P2 #16
(`/community/[slug]` detail). The `/community` discovery feed read `cookies()`
via `getCurrentUser()` + `isPlatformAdmin`, so its response was `private` —
re-rendered per request, never shared/CDN-cached — and it fetched up to 120 rows
each time. Goal: match the cacheable `/players` / `/groups` / `/teams` (Bundle
13a) posture.

## Decisions

- **Calibrated "cacheable" to cookies, not the `ƒ` label.** Like its Bundle 13a
  siblings, `/community` reads `searchParams` (filters / paging / location), so
  it stays `ƒ` in the build table — and that's fine. The thing that made it
  _uncacheable_ was `cookies()` (per-user → `Cache-Control: private`), not
  `searchParams` (per-URL → shareable). Removing the cookie reads makes the
  response shared across anonymous viewers and CDN-cacheable for 60s; the `ƒ`
  label is unchanged. `/players` is the reference: also `ƒ`, also reads
  `searchParams`, and is the documented-cacheable target.
- **No anon-client swap needed.** The finding suggested
  `createSupabaseAnonClient()`, but the search already runs on the **admin-backed
  `handlers` singleton** (module-level, no per-request cookies). So the only
  cookie dependencies were `getCurrentUser()` (→ `viewerId` + CTA) and
  `isPlatformAdmin`. Dropping those two + passing `viewerId = null` was enough.
- **Corrected the finding and preserved the own-hidden recovery path.** The
  original P3 #17 write-up claimed "the only viewer-conditional output is the CTA
  - admin link." Wrong: the search, given a `viewerId`, also mixes in the
    submitter's own `hidden` listings (`.or(status.eq.active, and(submitter=viewer,
status.eq.hidden))`), and the card badges them "Hidden — only you." Auto-hide
    (3 reports → `hidden`) is a **notification-less DB trigger**, so that inline
    surface is a submitter's _only_ in-app path back to an auto-hidden listing.
    Going `viewerId = null` would silently strand them. **Chose to preserve the
    path via a client island over accepting the regression** (asked the user;
    they chose "do it right"): a `<MyHiddenCommunityListings />` strip backed by a
    new `listHiddenBySubmitter` port + `getMyHiddenCommunityListings` server
    action. Own-hidden moves from inline (date-sorted in the main list) to a
    labeled top recovery section — the only feasible shape once the main list is
    cached (you can't inject viewer rows into cached server HTML inline).
- **Chose a thin repo port method + direct `repositories.*` call over a new
  Query/Handler.** `listHiddenBySubmitter` is a focused read projection; the web
  layer already calls `repositories.*` directly for view-specific reads (the
  bracket pages, the event-detail loaders), so a full CQRS Query+Handler pair
  would be empty ceremony. Added the method to the domain port + Supabase impl.

## Changes

- `packages/domain/.../community-listing-repository.ts` — added
  `listHiddenBySubmitter(userId)` to the `CommunityListingRepository` port.
- `packages/infrastructure/.../supabase-community-listing-repository.ts` —
  implemented it (admin client; `submitter_user_id = userId AND status = hidden`,
  soonest first; same summary mapping as `search`).
- **New** `app/community/my-hidden-listings-actions.ts` (`'use server'`) —
  `getMyHiddenCommunityListings()`; real-user gate → `repositories.communityListingRepo`.
- **New** `app/community/_components/community-submit-actions.tsx` (`'use client'`)
  — Submit/Sign-in CTA + admin import link, session resolved client-side.
- **New** `app/community/_components/my-hidden-community-listings.tsx`
  (`'use client'`) — recovery strip; reuses `CommunityListingCard`.
- `app/community/page.tsx` — dropped `getCurrentUser()` + `isPlatformAdmin`;
  `viewerId = null`; `export const revalidate = 60`; CTA block → island; added the
  recovery strip above the list.

## Patterns observed

- **"Cacheable" = no `cookies()`/`headers()`, not no `searchParams`.** A page can
  read `searchParams` (per-URL) and still be CDN-cached per-URL; only per-user
  inputs (`cookies`) force `private`. The `ƒ` build label conflates the two —
  judge cacheability by what the render reads, not the symbol. (Same calibration
  noted in the P2 #16 journal, from the other direction.)
- **The viewer-section-as-island pattern** (`<MyHiddenCommunityListings />`,
  `<MyTeamsPanel />`) is how you keep a viewer-specific slice on an otherwise
  cacheable public list — but it forces inline viewer rows into a separate
  section. Acceptable, often clearer; note it when the inline ordering mattered.

## Follow-ups

- **Moderation gap (not perf):** auto-hide sends no notification, so the recovery
  strip is the sole signal a listing was auto-hidden. A submitter notification on
  auto-hide is the durable fix and would make the strip optional. Belongs in the
  moderation/notifications backlog. Logged in
  [performance.md](../audits/performance.md) P3 #17 remediation entry.
- **P3 #20** — stale `events/[id]` anchors — is now the only open item from the
  2026-06-06 re-audit.
- **e2e** — the `/community` CTA + the submitter's hidden-listing visibility now
  route through client islands; the community Playwright specs should be re-run
  against dev (deploy-gated).
