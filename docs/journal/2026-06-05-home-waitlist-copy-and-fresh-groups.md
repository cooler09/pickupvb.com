# Homepage waitlist-copy honesty (H-7) + fresh groups peek (H-8) (2026-06-05)

## Context

Closes **H-7** and **H-8** from the 2026-06-05 re-audit of
[home-page-ux.md](../audits/home-page-ux.md) (bugs / gaps / stale-data sweep at
the user's request).

- **H-7 — overstated "waitlists" host claim.** The landing page sold "waitlists"
  as a host capability in three spots (the Host value-card body "run waitlists",
  the host-pitch prose "waitlists", the checklist "Waitlists & capacity rules").
  But there is no managed waitlist: the domain only raises
  `SpotFilled(..., waitlist: true)` when a position over-fills, and the player
  sees a "Join waitlist" CTA. There's **no host-side waitlist roster, no
  promotion, no auto-fill** — confirmed by the `waitlist-not-implemented` note
  (the **Hannah** persona gap). A host signing up on that promise would hunt for
  a "promote from waitlist" control that doesn't exist.
- **H-8 — stale groups peek.** The page comment says it pulls "fresh content to
  make the landing page feel alive," but `listCards(6)` ordered by `name ASC`,
  so the "Groups & organizations" peek showed the same six alphabetically-first
  groups forever, and the subtitle ("crews running events") wasn't enforced.

## Decisions

- **H-7: soften the copy, don't gate it on building the feature.** Took the
  audit's option (a): the Host card now reads "set capacity", the prose
  "capacity limits", and the checklist "Capacity & over-fill rules". The
  player-facing "Join waitlist" CTA on the event-detail page is _accurate_ (a
  player genuinely can sign up over capacity) so it was left untouched — only the
  **host-capability** framing on the homepage overstated. A real managed-waitlist
  queue (option b) stays the separate **Hannah** initiative; the copy fix
  shouldn't wait on it.
- **H-8: order `created_at DESC`, not a join on upcoming events.** Took option
  (a) — `listCards` now orders newest-first so the slice rotates as new clubs
  join. `created_at` doesn't need to be in `CARD_COLUMNS` for the server-side
  order to apply, so no mapper/type change. Rejected option (b) (filter to groups
  with `host_group_id` events in the future): it's truest to the old "running
  events" subtitle, but in a sparse market it would often empty the section —
  re-introducing the still-open **H-3** empty-section risk. Instead the subtitle
  was softened to "Clubs, leagues, and crews on PickupVB", which `created_at`
  ordering can honestly back.
- **`listCards` has exactly one caller (the home peek),** so changing its order
  in place — rather than adding an ordering param — is safe; the `/groups`
  directory uses `searchDirectory` (still `name ASC`). Updated the port doc on
  `GroupQueries.listCards` from "ordered by name" to "newest-first" so the
  contract matches.

## Verification

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` — all green. The only
lint warnings are pre-existing `set-state-in-effect` ones in unrelated files. No
new test: H-7 is copy and H-8 is a one-column `ORDER BY` flip — neither is a
behavioral invariant worth a unit test (per AGENTS "Skip the test when…").

## Files

- [apps/web/src/app/page.tsx](../../apps/web/src/app/page.tsx) — the three
  waitlist strings + the groups subtitle.
- [packages/infrastructure/src/supabase-group-query-repository.ts](../../packages/infrastructure/src/supabase-group-query-repository.ts)
  — `listCards` ordering.
- [packages/domain/src/groups/group-queries.ts](../../packages/domain/src/groups/group-queries.ts)
  — port doc.

## Follow-ups

- **H-9 ✅ (P3, shipped same day):** the anon peek reads were cached via
  `unstable_cache` + admin client — see
  [2026-06-05-home-peek-cache.md](2026-06-05-home-peek-cache.md).
- **H-2 / H-3 / H-6** remain open from the prior pass.
- The real **Hannah** waitlist-queue feature (H-7 option b) is still unbuilt.
