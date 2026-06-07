# Community-listing detail: ISR-cacheable shell (2026-06-07)

## Context

Performance audit **P2 #16** (the 2026-06-06 re-audit). The new public
`/community/[slug]` detail page — a deliberate SEO/share target (canonical +
OpenGraph + `CommunityListingJsonLd`) — read `cookies()` via `getCurrentUser()`
for the whole render, so Next 16 marked the route dynamic and **every anonymous
spectator/crawler load was a full origin render**. The data layer was already
cached (`loadCommunityDetailPublic` → `unstable_cache`), but the page shell
itself was never CDN/ISR-cached. Same partial state `/events/[id]` is parked in
(Bundle 26). This bundle applies the Bundle 25 (`/teams/[id]`, `/groups/[id]`,
`/players/[id]`) ISR refactor to it.

## Decisions

- **Chose a cookie-free server shell + a client viewer-chrome island over
  keeping the page dynamic.** To get a route out of "truly-dynamic `ƒ`" (uncached)
  in Next 16 without PPR, **no** server code path may touch a Dynamic API
  (`cookies` / `searchParams`). So all viewer-conditional chrome (manage / claim /
  report / pending-review) moved into a `CommunityViewerProvider` client island
  that resolves the viewer after hydration (one `auth.getUser()`, then — only for
  a real session — one `getCommunityViewerChrome` server action). Build confirms
  `/community/[slug]` now renders `ƒ` **identically to the proven-cacheable
  `/teams/[id]` / `/players/[id]` / `/groups/[id]`** — the on-demand-ISR `ƒ`, not
  the uncached one.
- **Chose a shared-fetch context provider feeding two consumer islands over one
  island.** The viewer chrome is interleaved — status alerts above the header,
  action panels below the external-link CTA — so a single island can't hit both
  mount points. `CommunityViewerProvider` fetches once; `CommunityViewerAlerts`
  (top) and `CommunityViewerActions` (bottom) consume the same context. Preserves
  the exact existing layout (no UX change for the common case).
- **Chose a server action (`getCommunityViewerChrome`) over porting the viewer
  reads to the browser.** The chrome needs RLS-scoped reads (canManage,
  hasReported) plus the claim-eligibility hosted-events query + day/city filter.
  Reusing the existing server logic via an action is type-safe and avoids
  duplicating query/RLS logic client-side. React Flight serializes the `Date`
  fields in the return, so no revival dance (unlike `unstable_cache`).
- **Chose to move the `?notice=` flash banner client-side** (`useSearchParams`
  inside a `<Suspense fallback={null}>`) rather than keep it on the page —
  reading `searchParams` server-side alone would re-force the route dynamic.
- **Chose to keep the claimed→event 301 + a cookieless existence probe on the
  server.** The claimed redirect must be a real 301 for crawlers, and it's
  viewer-independent, so it resolves the target slug on the **admin client**
  (no cookies). For the null-public branch, `communityListingExists` (admin
  client) distinguishes a genuinely-missing slug (real `notFound()`) from a
  hidden/removed listing (manager island).
- **Accepted a soft-state change for non-managers on hidden/removed listings.**
  Previously a non-manager (incl. anon) hitting a hidden/removed slug got a hard
  404 (the server viewer-read returned null → `notFound()`). Now the page can't
  read the viewer server-side, so it renders a 200 "this listing isn't available"
  notice via the client island instead. **Genuinely-missing slugs still 404**
  (existence probe). Hidden/removed are `noindex`, so the soft-vs-hard distinction
  is SEO-immaterial, and no content leaks (the island's server action enforces the
  same RLS/status gate). This is the inherent cost of moving auth-gated content to
  a client island; judged acceptable for the caching win on the 99% (active /
  claim_pending) path.

## Changes

- **New** `_components/community-listing-article.tsx` — pure presentational body
  (eyebrow / title / submitter / When-Where / description / outbound CTA), shared
  by the **server** shell and the **client** manager view. No directive → renders
  in both environments.
- **New** `_components/community-viewer-chrome.tsx` (`'use client'`) —
  `CommunityViewerProvider` (context, one `auth.getUser()` + one action),
  `CommunityViewerAlerts`, `CommunityViewerActions`, `CommunityRestrictedView`.
- **New** `_components/community-notice-banner-client.tsx` (`'use client'`) —
  `useSearchParams` wrapper around the existing presentational banner.
- **New** `community-viewer-actions.ts` (`'use server'`) — `getCommunityViewerChrome(slug)`;
  real-user gate, delegates to the loader.
- `_components/community-action-sections.tsx` — added `'use client'` (now rendered
  by the islands instead of the page).
- `_loaders/load-community-detail-page.ts` — replaced `loadCommunityDetailPage`
  (page model) with `loadCommunityViewerChrome(slug, user)` (viewer-only chrome);
  dropped the now-page-owned claimed-redirect / notice / public-detail branches.
- `community-detail-cache.ts` — added cookieless `resolveClaimedEventTarget` +
  `communityListingExists` (admin client).
- `page.tsx` — rewritten: `export const revalidate = 60`, no `cookies()`/`searchParams`;
  claimed→301, cookieless existence-probe + manager island for the null-public case,
  public shell (article + provider + alerts/actions + Suspense notice) otherwise.

## Patterns observed

- **A dynamic segment with `revalidate` + no `generateStaticParams` renders as
  `ƒ` in the build table whether or not it's actually cached** — the label alone
  doesn't prove the win. The real signal is "does any server path touch a Dynamic
  API." Calibrate against a known-good sibling (`/teams/[id]` is also `ƒ` and is
  cached). Worth remembering for the next ISR refactor so nobody "fixes" a `ƒ`
  that's already optimal.
- **The provider-over-server-children pattern** (`<ClientProvider>{serverNode}
<ClientConsumer/></ClientProvider>`) is the clean way to inject client viewer
  state at multiple, interleaved positions in an otherwise server-rendered tree
  without a layout change. Reusable for the deferred `/events/[id]` shell.

## Follow-ups

- **P3 #17** — `/community` (listing) is still dynamic-per-request + 120-row
  fetch; same deferred class as `/events`. The viewer-chrome-island + anon-client
  pattern here is the template. [performance.md](../audits/performance.md).
- **P3 #20** — stale `events/[id]` line anchors in the older audit findings.
- **e2e not re-run** — the community claim/report/manage flows now route through a
  client island; the Playwright community specs should be re-run against dev to
  confirm the hydration-gated chrome still drives those journeys (deploy-gated —
  Vercel renders the deployed build, not local).
- `/events/[id]` full ISR shell remains the big deferred P1 #1 item; this bundle
  is the lighter proof-of-pattern for it.
