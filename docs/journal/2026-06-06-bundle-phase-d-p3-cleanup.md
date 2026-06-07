# Phase D — P3 cleanup: messages.ts split + page-diet render extraction (2026-06-06)

## Context

The two P3s from the 2026-06-06 re-audit, both low-risk / no-DB. See
[architecture.md § Reevaluation — 2026-06-06](../audits/architecture.md#reevaluation--2026-06-06).

## Decisions

- **P3-2 (`messages.ts` 761-LOC single-module) — split, kept a barrel.** Carved the
  ~90 command/query classes into a `messages/` directory, one file per subdomain
  (`event`, `team`, `community-listing`, `media-post`, `user-profile`, `group`,
  `messaging`, `account-deletion`), re-exported from `messages/index.ts`. Chose a
  directory + barrel (over `commands/*.commands.ts` per the audit example) so a
  subdomain's commands **and** queries stay in one file; the barrel keeps every
  `@pickupvb/application` consumer and the ~25 in-package importers working with a
  one-line path change (`../messages` → `../messages/index`). Deleted the
  monolith. The bracket / standalone-bracket / league / scoring commands already
  live in their handler files, so this makes the convention consistent
  ("command/query shapes sit per-subdomain, near their handlers").
- **P3-1 (page diets) — extracted render branches from the two worst pages; stopped
  there deliberately.** Applied the audit's prescribed action ("extract render
  branches into `_components/`") to events/page (602 → 501: `EventsEmptyState` +
  `CommunityRail`) and profile/page (601 → 537: `SectionHeader` + `ActionTile`) —
  all pure presentational, moved verbatim. **Did NOT** chase all five pages under
  the ~200-LOC cap: the residual bulk on these pages is **data orchestration**
  (param parsing, fetch, filter, sort, paginate, URL building), not render
  branches, so the deeper cut needs per-page `_loaders/` extraction. Crucially,
  page **render output is not covered by the verify quad** (no page unit tests),
  so further flagship-page surgery is best done incrementally with per-page
  manual / e2e confirmation rather than batched blind at session end.

## Changes

- New [packages/application/src/messages/](../../packages/application/src/messages/)
  (8 subdomain files + `index.ts` barrel); deleted `messages.ts`; repointed
  `index.ts` + the ~25 handler/test importers to `../messages/index`.
- New [events/\_components/events-empty-state.tsx](../../apps/web/src/app/events/_components/events-empty-state.tsx)
  - [community-rail.tsx](../../apps/web/src/app/events/_components/community-rail.tsx);
    [events/page.tsx](../../apps/web/src/app/events/page.tsx) 602 → 501.
- New [profile/\_components/profile-section-primitives.tsx](../../apps/web/src/app/profile/_components/profile-section-primitives.tsx);
  [profile/page.tsx](../../apps/web/src/app/profile/page.tsx) 601 → 537.

## Verify

- Quad green: typecheck 15/15; lint 0 errors; test (domain 547 / application 145 /
  infra 53 / web 262); build 8/8. P3-2 runtime resolution confirmed by the
  application test suite (the barrel resolves for both extensionless and `.js`
  importers).

## Follow-up (2026-06-06) — P3-1 remainder finished ✅

The three remaining pages were decomposed via the `_loaders/` + `_components/`
pattern (verbatim moves, typecheck-clean, verify quad green):

- **community/[slug] 567 → 203** — data orchestration (claimed-redirect resolve,
  pending-claim fetch, claim-eligibility filter) → `_loaders/load-community-detail-page.ts`;
  `CommunityNoticeBanner` + the four interaction sections (pending-claim review,
  claim, report, manage) → `_components/`.
- **profile/billing/earnings 424 → 82** — the whole audit-ledger aggregation
  (per-PI / per-event / per-month rollups, totals, YTD) → `_loaders/load-earnings.ts`;
  the totals cards, by-event table, monthly + statements grid → `_components/earnings-sections.tsx`.
- **events/[id] 424 → 360** — extracted the When/Spots section, a DRY'd
  bracket/schedule subpage card, and the manage banner. The remainder is
  irreducible composition (a 33-field view-model destructure + ~20 sub-component
  wirings); it was already the most-decomposed page (loader + 20+ `_components/`).

With the earlier render-branch extraction (events/page 602 → 501, profile/page
601 → 537), **all five flagged pages are decomposed → P3-1 resolved.** Optional
polish remains: events/page + profile/page still assemble data inline and could
take `_loaders/` too — low value (correct data assembly, not bloat).

**Architecture initiative: the entire 2026-06-06 re-audit backlog is resolved**
(No P1; P2-1/P2-2/P2-3 resolved — C3 `save_event` deployed + verified green on
dev; P3-2 resolved; P3-1 resolved).
