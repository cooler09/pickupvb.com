# Players directory: card signal + follow-from-grid (PL-1…PL-4) (2026-06-01)

## Context

Shipped four of the five findings from
[players-page-ux.md](../audits/players-page-ux.md) — the players directory was
mechanically fine but did its stated job ("find people to follow, add to your
team, or invite to a group") poorly: cards showed only avatar + name + city, and
the only action was click-through to a profile.

## Decisions

- **PL-1 — positions over a richer profile object.** `profiles_public` already
  exposes `primary/secondary/tertiary_position`, so the enrichment is
  render-plus-one-column with **no migration**. Added `positions: string[]`
  (ordered, nulls dropped) to `ProfileCard` and built it in the single mapper
  (`toCard`); every `ProfileCard` consumer (friends lists, mention cards) gets
  the data for free and can render it later. Skipped a **Pro badge** on the card
  on purpose: the view has `show_pro_badge` (a preference) but **no is-pro
  signal**, so a trustworthy badge would need a view change — out of scope.
- **PL-2 — one provider, not N self-resolving buttons.** The page must stay
  sessionless + ISR. Rather than give each of 24 cards its own
  `auth.getUser()` + `friendships` lookup (the detail-page pattern, fine for one
  card), a single `PlayersFollowProvider` resolves the viewer once and does **one**
  `friendships` query scoped to the visible ids (`.in('friend_id', ids)`), then
  shares it via context. Per-card `FollowButton`s read context and render
  **nothing** while loading / for anon / for self — so the server-rendered (anon)
  HTML is byte-identical to before and follow is pure progressive enhancement.
  This is the canonical "client provider wrapping server-rendered children, with
  client islands inside reading its context" shape — the provider takes the
  server `<ul>` as `children`.
- **Stretched-link to fit the button.** A `<button>` can't nest inside the
  card's `<Link>`. Restructured the card to the EventCard **F-3** pattern:
  `<li relative>` + the name link's `after:absolute inset-0` makes the whole tile
  navigate, and the Follow button is `relative z-10` so it captures its own
  click. Avatar/city/chips sit under the overlay (clickable → navigate).
- **PL-2 graded P3, shipped anyway.** Following from an event page / profile is
  the _designed_ path (the Following-feed empty state says so), so the
  click-through worked — but the directory is literally titled around following,
  so closing the loop is high-value and the provider kept the cost contained.
- **PL-3 — `fieldInputClass` + `sm:items-center`.** `fieldInputClass` bakes in a
  label-oriented `mt-1`; the search row has no labels, so `sm:items-center` makes
  the margin visually negligible while still adopting the canonical field vocab.
  Search → `primaryButtonClass()` to match `/groups` (the two directories now
  agree).
- **PL-5 — deliberately deferred.** True geo/near-me needs a profiles location
  column + geocoding-on-save + a radius filter — a migration (auto-applied on
  deploy) and a cross-cutting feature the audit graded aspirational. Not folded
  into a card-polish bundle; left as the one open finding with a clear path.

## Changes

- [profile-queries.ts](../../packages/domain/src/users/profile-queries.ts) —
  `ProfileCard.positions: string[]`.
- [supabase-profile-repository.ts](../../packages/infrastructure/src/supabase-profile-repository.ts)
  — `CARD_COLUMNS` + `CardRow` + `toCard` build `positions`.
- [players/\_components/players-follow.tsx](../../apps/web/src/app/players/_components/players-follow.tsx)
  — new `PlayersFollowProvider` + `FollowButton`.
- [players/page.tsx](../../apps/web/src/app/players/page.tsx) — header count;
  `fieldInputClass`/`primaryButtonClass` form; card restructure (stretched-link,
  position chips, follow button) wrapped in the provider.

## Patterns observed

- **One context provider + many island consumers is the way to add
  viewer-state to an ISR list.** It keeps the page sessionless/cacheable, does a
  single scoped lookup for the whole page (not N), and degrades to the anon shell
  for free (islands render null until resolved). Reusable for any future "act on
  a row" affordance on a cached directory (e.g. join-group on `/groups`).

## Follow-ups

- **PL-5 (P3)** — geo/near-me for player discovery: add a geocoded location to
  profiles (migration + geocode-on-save mirroring the events geocoder), expose it
  in `profiles_public`, and add a radius filter + Near-me control. The only open
  item on [players-page-ux.md](../audits/players-page-ux.md).
- **`ProfileCard.positions` is now available to other consumers** (friends lists,
  mention cards) — they could surface positions too, a one-line render each.
