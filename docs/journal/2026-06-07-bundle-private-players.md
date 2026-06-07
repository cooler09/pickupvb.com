# Private players: opt out of discovery (directory / search / team invites) (2026-06-07)

## Context

User request: some players don't want to be visible in the players list or
findable in search, and don't want to be added to someone else's team — but they
should still be able to sign up for events, appear on the rosters of events they
join, and create their own team. Their public profile page (a direct
`/players/[handle]` link) should keep working.

Every non-deleted profile is exposed through the `profiles_public` view and
surfaces in three discovery paths: the `/players` directory, the name-search
typeahead, and the "add a teammate / add a member" pickers (both go through
`searchPeople` → `ProfileQueries.searchCards`). This bundle adds a single
per-player `discoverable` preference that gates exactly those three paths.

## Decisions

- **One `discoverable boolean not null default true` column on `profiles`, not a
  separate privacy table.** It's a single per-player preference threaded through
  the existing `UserProfile` aggregate exactly like `show_pro_badge` /
  `auto_accept_team_invites`. Default `true` preserves today's behaviour for every
  existing row.
- **Filter only the two discovery reads, never the view itself or the card-by-id
  lookups.** `SupabaseProfileRepository.searchDirectory` and `searchCards` add
  `.eq('discoverable', true)`. `findCardsByIds` / `findCardById` /
  `findCardByHandle` / `findPlayerByHandle` stay unfiltered, so a private player
  still resolves on event rosters, attendee/sender chips, and their own profile
  page. "Private" means _not discoverable_, not _deleted/hidden everywhere_
  (confirmed with the user — keep the profile page viewable so teammates on a
  team they captain can still open it).
- **Expose `discoverable` in `profiles_public` but don't filter the view.** The
  anon directory client and the session-scoped picker both read the view, so the
  column has to be projected for the `.eq()` filter to work; leaving the view
  unfiltered is what lets the by-id reads keep resolving everyone.
- **Hard guard on team-add, search-filter for group-add.** The team "add member"
  action (`teams/actions.ts addMemberFromForm`) already does an admin read of the
  invitee's `auto_accept_team_invites`; extended it to also read `discoverable`
  and return early when `false`. This makes "cannot be added to a team" a real
  guarantee against a direct/stale user id, not just hiding from the picker.
  Group-add shares the same `searchPeople` path, so private players already drop
  out of its picker — no separate hard guard added there (lower stakes; chosen
  scope was "block via the shared search").
- **Positive toggle ("Appear in player search"), default on.** Mirrors the other
  opt-in `ToggleCard`s. Unchecked checkbox ⇒ absent from FormData ⇒ `bool()` ⇒
  `false` ⇒ private. Always rendered, so there's no accidental-private ambiguity.

## Changes

- `supabase/migrations/20260924000000_profiles_discoverable.sql` — add the column;
  DROP+CREATE `profiles_public` to add `discoverable` to the projection (matches
  the `20260921000000` rebuild shape); re-grant.
- `packages/supabase/src/database.types.ts` — **hand-edited** (`profiles`
  Row/Insert/Update + `profiles_public` Row). Will be regenerated from the
  deployed schema on the next `gen:types`.
- `packages/domain/src/users/user-profile.ts` — `discoverable` on
  `ProfileDetailsEdit` + the aggregate (ctor/getter/`editDetails`/`create`
  default true/`fromPersistence`).
- `packages/infrastructure/src/supabase-user-repository.ts` — column in
  `EDITABLE_COLUMNS`, `EditableRow`, `findById` mapping (`?? true`), `save`.
- `packages/infrastructure/src/supabase-profile-repository.ts` —
  `.eq('discoverable', true)` on `searchDirectory` + `searchCards` only.
- `apps/web/src/app/profile/_loaders/load-profile-page.ts` — select + `ProfileRow`
  - `ProfileView` + mapping.
- `apps/web/src/app/profile/profile-form.tsx` — `Profile` type + "Appear in player
  search" `ToggleCard` in Preferences.
- `apps/web/src/app/profile/actions.ts` — read `discoverable`, thread into
  `UpdateProfileCommand`, add `revalidatePath('/players')`.
- `apps/web/src/app/teams/actions.ts` — extend the admin pref read; early-return
  when the invitee is private.

## Patterns observed

- The `profiles_public` view + `ProfileQueries` split is the right seam: gating
  _discovery_ is a one-line `.eq()` in two adapter methods, while _participation_
  reads (by-id/by-handle) are untouched because they're separate methods. The
  AGENTS pattern #13 ("read display cards from `profiles_public`") already steered
  every reader through this port, so the change landed in one place per concern.

## Follow-ups

- Paid-event / waitlist surfaces weren't reviewed for discovery leaks — none
  read `searchCards`/`searchDirectory`, so out of scope here.
- If a future surface needs to show "this player is private" affordance copy
  (e.g. greying them out in a roster), it can read `discoverable` off the
  now-exposed view column. Not built — no caller needs it yet.
