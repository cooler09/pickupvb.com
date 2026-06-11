# Host how-to guides — the `/help` route (C2) (2026-06-11)

## Context

The onboarding effort had shipped its _mechanical_ half — the B2 host checklist,
E1 empty-state teaching, and M1 funnel instrumentation
([feature-education.md](../feature-education.md)) — but nothing that _explains_
the host lifecycle. The backlog named the gap as **C2, "a `/help` or
`/how-it-works` route with role-segmented guides,"** and it was never built. The
host journey is the long, cliff-filled one (Stripe walls, divisions,
registration modes), so written guides are high-leverage: they give the
checklist + empty states a deep-link target, and — like `/tools` — they're SEO
landing pages for hosts searching "how to run a volleyball tournament." Built
host-first; the structure takes player guides as a one-entry addition.

## Decisions

- **Mirror the legal section, not invent a docs engine.** Per-guide `page.tsx`
  files + a shared meta module is the established
  ([legal-meta.ts](../../apps/web/src/app/legal/legal-meta.ts)) content pattern;
  no MDX, no CMS. [help-meta.ts](../../apps/web/src/app/help/help-meta.ts) is the
  SSOT for slug/title/description/audience/order/lastUpdated and feeds the hub
  cards, each guide's `metadata`, and the sitemap, so SEO copy can't drift from
  the hub.
- **Prose chassis scoped to a `GuidePage` wrapper, _not_ a `help/layout.tsx`.**
  A segment layout would also wrap the card-grid hub, and the hand-rolled prose
  rule `[&_a]:underline` beats a `no-underline` utility on specificity — it would
  force-underline every card link. Putting the chassis in
  [guide-page.tsx](../../apps/web/src/app/help/_components/guide-page.tsx) (and
  rendering the breadcrumb/footer chrome _outside_ the prose `<article>`) keeps
  the hub clean and the guide nav links un-underlined. The wrapper also renders
  the `<h1>` from the catalog so it always equals the SEO title.
- **Never restate pricing numbers — link to `/pricing`.** The pricing page
  derives its rates from `lib/pro.ts` (monetization audit M-3); the guides say
  "a small platform fee (Pro hosts pay half)" / "free-fee tips" and link out, so
  the prose can't go stale when a rate changes.
- **Five host guides** covering the lifecycle: `getting-started`,
  `getting-paid`, `tournaments-and-brackets`, `leagues`, `running-event-day`.
  Content sourced from [features.md](../features.md) §1–9 for accuracy.
- **Surface it so it isn't an orphan route:** footer "Guides" link, a "Read the
  host guide" link on the `/host` zero-state, an optional `learnMore` link on the
  host onboarding checklist card, and all six routes in the sitemap.

## Changes

- New [help-meta.ts](../../apps/web/src/app/help/help-meta.ts) — guide catalog +
  `helpGuide` / `helpGuidesFor` / `helpLastUpdatedDate` / `guideMetadata` helpers.
- New [help/\_components/guide-page.tsx](../../apps/web/src/app/help/_components/guide-page.tsx)
  — prose-scoped wrapper (breadcrumb, h1, last-updated, footer CTA).
- New [help/page.tsx](../../apps/web/src/app/help/page.tsx) — the hub: audience
  sections (host populated, player section auto-renders once it has guides) of
  guide cards from the catalog.
- New guide pages under `apps/web/src/app/help/<slug>/page.tsx` (×5), each thin:
  `metadata = guideMetadata(slug)` + authored JSX inside `<GuidePage>`.
- [site-footer.tsx](../../apps/web/src/components/site-footer.tsx) — "Guides" in
  the Product column.
- [host/page.tsx](../../apps/web/src/app/host/page.tsx) — guide link on the
  not-yet-hosted zero-state.
- [onboarding-checklist.tsx](../../apps/web/src/app/profile/_components/onboarding-checklist.tsx)
  — optional `learnMore` prop; [profile/page.tsx](../../apps/web/src/app/profile/page.tsx)
  wires it for the host card only.
- [sitemap.ts](../../apps/web/src/app/sitemap.ts) — `/help` + each guide
  (`lastModified` from the catalog).

## Patterns observed

- **typedRoutes chicken-and-egg on a brand-new route.** `pnpm typecheck` runs
  against the _previously_ generated `.next/types`, so a literal `'/help'` /
  `'/help/getting-started'` isn't in the `Route` union until a `next build`
  regenerates it — `tsc` rejects the bare literal. The repo's standard fix
  (`as Route`, already used for `/events/new` etc.) applies; flagged with a
  one-line comment at the footer/profile call sites. In-guide links were cast
  from the start so they were never affected.
- **Prose `[&_a]` selectors beat utility classes on specificity.** A
  `[&_a]:underline` descendant rule (0,1,1) outranks a `no-underline` utility
  (0,1,0) regardless of order — render chrome links _outside_ the prose root
  rather than trying to opt them out.

## Follow-ups

- **Player-track guides** (`audience: 'player'`) — the hub's Player section and
  the sitemap pick them up automatically; just add catalog entries + pages. The
  ask here was host-focused.
- Other open onboarding backlog in [feature-education.md](../feature-education.md):
  H2 pre-publish readiness, H3 "what happens next," E2 hint popovers, G1 tours,
  G2 sandbox, C1 GIFs.

## Verify

Quad green (`pnpm typecheck && lint && test && build`) — 380 web tests pass, 0
lint errors (3 pre-existing scoreboard warnings); all six `/help` routes build.
Content pages with no domain logic, so no new unit tests. The visual rendering
(prose styling in both themes, card grid, the deep-links resolving) is **not**
exercised by the static quad — wants a quick real-app pass, deploy-gated like the
rest of the uncommitted tree.
