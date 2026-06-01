# Remove player hero banner; avatars carry the display-icon role (2026-06-01)

## Context

User request: players don't need a hero **banner** image — but they may
want a display icon (an uploaded picture where initials show today). The
avatar/profile-picture feature already shipped in the recent `profile
picture` + `avatar crop` commits (round crop/zoom upload to the `avatars`
bucket, `migration 20260830000000_user_avatars.sql`) and already renders
**in place of the initials** on the profile identity hero, the public
player page, and the players directory. So the "display icon" half was
done; the actionable ask was to drop the now-redundant player hero banner.

## Decisions

- **Removed the player hero banner UI, kept the avatar.** The avatar is the
  display icon the user wanted; the banner was a second image surface
  players don't need.
- **Removed the dead read field `PlayerProfile.heroImageUrl` and its
  repository mapping**, since the public player page was its only consumer.
  Chose this contained cleanup over leaving a column fetched-but-never-
  rendered on every ISR render of `/players/[handle]`.
- **Left the shared hero infrastructure untouched.** `HeroImagePanel` /
  `HeroImageUpload` / `hero-image-actions.ts` stay generic (`'events' |
'groups' | 'profiles'`) — events and groups still use them. The
  `UserProfile` write aggregate keeps its `heroImageUrl` field/`setHeroImage`
  (interwoven with the general profile save), and the `profiles.hero_image_url`
  column + `hero-images` bucket stay. Rejected a DB migration to drop the
  column: out of scope, and it risks the `purge_hero_image_orphans` liveness
  join (cache-buster P1, migration 20260819000000). Existing stored profile
  banner URLs remain in the column but are no longer shown or editable.

## Changes

- `apps/web/src/app/players/[id]/page.tsx` — removed `<HeroImage>` render +
  the unused `HeroImage` import.
- `apps/web/src/app/profile/page.tsx` — removed the `HeroImagePanel`
  (profiles) block + import; dropped `hero_image_url` from the profile
  select and `ProfileRow` type.
- `packages/domain/src/users/profile-queries.ts` — removed
  `heroImageUrl` from the `PlayerProfile` read projection (+ doc comment).
- `packages/infrastructure/src/supabase-profile-repository.ts` — dropped
  `hero_image_url` from `PLAYER_COLUMNS`, `PlayerRow`, and the `toPlayer`
  mapping.

## Patterns observed

- Before "adding" a feature, grep for it — the display-icon ask was already
  implemented end-to-end; the real work was removal, not addition. A quick
  `AskUserQuestion` confirmed direction rather than building a duplicate.

## Follow-ups

- Optional storage reclaim: a one-off to null out `profiles.hero_image_url`
  so `purge_hero_image_orphans` can sweep the orphaned profile banners.
  Deferred — harmless as-is, and not requested.
