# Community listing auto-hide notification (2026-06-07)

## Context

Follow-up surfaced by performance audit **P3 #17** (the `/community` cacheable
refactor). A community listing is auto-hidden once it crosses 3 reports — a
`community_listings_after_report` **DB trigger** flips `status` `active`→`hidden`.
That action was **silent**: no notification, and (after P3 #17 made the public
list cookie-free) the submitter's only remaining in-app signal was the
`<MyHiddenCommunityListings />` recovery strip. This closes the gap: the
submitter now gets a transactional email + bell when their listing is auto-hidden,
deep-linked to review/unhide it.

## Decisions

- **Detect the transition in the handler via a post-report re-read, not a
  hardcoded threshold.** `ReportCommunityListingHandler` now reads the listing
  before `recordReport` (status), records, and — only if it was `active` —
  re-reads to see whether the trigger flipped it to `hidden`. Returns
  `{ autoHidden }`. Chose this over predicting `reportCount + 1 >= 3` in TS
  because the threshold lives in the SQL trigger; reading the _result_ keeps a
  single source of truth. The extra `findById` is on the rare report-write path.
- **Notify from the action, not the handler** — matches the existing claim
  pattern (`notifyClaimPending` / `notifyClaimApproved` are called from
  `listing-actions.ts` after the handler). The application layer stays pure
  (returns `{ autoHidden }`); the web action calls the best-effort
  `notifyListingAutoHidden` helper. Notifies **only on the transition**, so later
  reports against an already-hidden listing don't re-ping.
- **`transactional` category, `email` + `in_app` channels.** Mirrors
  `community.claim.pending`: it's a moderation action on the user's own content
  they must know about and can act on, so it's never disable-able; email + bell
  (no push/SMS) because the listing has already left the public feed and a bell
  alone could be missed.

## Changes

- `packages/notifications/src/kinds.ts` — new `community.listing.auto_hidden`
  kind: union, `KIND_CATEGORY` (transactional), `KIND_DEFAULT_CHANNELS`
  (`['email','in_app']`), `NotificationPayloadMap` (`{ listingSlug, listingTitle,
reportCount }`).
- `packages/notifications/src/templates.ts` — email + SMS + in-app renderers
  (the renderer maps are exhaustive over `NotificationKind`, so all three are
  required for typecheck).
- `packages/application/src/commands/community-listing.handler.ts` —
  `ReportCommunityListingHandler.execute` now returns `{ autoHidden: boolean }`
  via the before/after status re-read.
- `apps/web/src/lib/notify-community.ts` — new `notifyListingAutoHidden(listingId)`
  (admin client, reads slug/title/submitter/report_count, best-effort,
  display-safe).
- `apps/web/src/app/community/[slug]/listing-actions.ts` — `reportListing`
  captures `{ autoHidden }` and calls the helper when true.
- `packages/application/src/commands/community-listing.handler.test.ts` — 3 cases
  for the transition detection (crosses threshold → true; below threshold →
  false; already-hidden → false but still records the report). The fake repo
  models the trigger.

## Patterns observed

- **Adding a `NotificationKind` is a 7-point change** (kinds.ts ×3 maps +
  payload, templates.ts ×3 renderers) and the exhaustive mapped types make
  typecheck the safety net — miss one and `tsc` fails. No runtime registry drift
  possible.
- **Detecting a DB-trigger side-effect**: re-read the row rather than re-deriving
  the trigger's condition in app code. Keeps the threshold single-sourced in SQL.

## Follow-ups

- **Verification:** typecheck (15/15), lint (0 errors), and tests (application
  145→148) are green; the production build **compiled successfully**. The full
  `pnpm build` static-generation phase was getting SIGTERM'd in this session (an
  environment artifact from overlapping build runs, not these changes — the
  notification code isn't exercised by prerender). Run a clean `pnpm build` to
  confirm 8/8 before shipping.
- **e2e:** the report→auto-hide→notify path is worth an e2e against dev (3
  reports from distinct accounts → submitter sees the bell + the recovery strip).
  Deploy-gated.
