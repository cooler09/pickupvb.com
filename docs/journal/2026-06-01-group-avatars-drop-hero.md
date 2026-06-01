# Group avatars become uploadable; group hero banner dropped (2026-06-01)

## Context

Follow-on to the same-day player-hero removal
([2026-06-01-remove-player-hero-banner.md](2026-06-01-remove-player-hero-banner.md)).
User request: "groups also don't need hero images, but will need uploadable
avatars." Groups already had an `avatar_url` (rendered with an initials
fallback in `GroupHeader`), but it was set by **pasting a URL** in the
new/edit group forms — there was no upload path. So this bundle does two
things: drop the group hero banner, and replace the paste-a-URL field with the
same crop-upload widget users get for their profile picture.

## Decisions

- **Reused the `avatars` Storage bucket + crop widget rather than building a
  group-specific one.** Group avatars upload to
  `${userId}/groups/${groupId}/avatar.webp` — the leading `${userId}/` segment
  satisfies the bucket's existing owner-path RLS, so **no new bucket or policy**.
  `AvatarUpload` grew two optional props (`objectPath`, `shape`) and
  `AvatarCropDialog` one (`cropShape`); all default to the current profile
  behaviour, so the profile call site is unchanged. `shape="rounded"` +
  `cropShape="rect"` match how a group logo renders (square) vs a person (circle).
- **Decoupled the avatar from the profile-edit command — mirroring the
  `UserProfile` split.** Removed `avatarUrl` from `GroupProfileEdit` /
  `Group.editProfile`; added `Group.setAvatar(url)` + `SetGroupAvatarCommand` /
  `SetGroupAvatarHandler`. **Why:** once the avatar is uploaded out-of-band, a
  profile-form save must not carry (and therefore null) the avatar. With the
  split, `editProfile` leaves the loaded avatar untouched and `save` re-persists
  it — neither write path clobbers the other. A domain test pins this
  (`editProfile leaves an uploaded avatar untouched`).
- **Authorization stays RLS-first.** `saveGroupAvatarUrl` runs through
  `getGroupHandlers()` (user-scoped client), so the `groups_update` owner/admin
  policy is the gate (AGENTS pitfall #8). The edit page already redirects
  non-managers; the action also rejects anon/unauthed.
- **Taught the orphan walker about groups instead of adding a second walker.**
  `purge_avatar_orphans` now has a `union`-ed liveness branch over
  `groups.avatar_url` (join on the group id in the 3rd path segment, guarded by
  `[2] = 'groups'`). Without it the nightly sweep would reap every group avatar
  after the grace window — the **P1 data-loss class** the user-avatar migration
  called out for hero images (20260819000000). One walker, two liveness columns;
  no new bucket/cron. Migration only `CREATE OR REPLACE`s the function — no
  schema/types change.
- **Removed the create-form avatar field entirely** (you can't key an upload to
  a group id that doesn't exist yet). New groups set the avatar on the edit page
  after creation — same as a user uploads their picture on profile-edit, not at
  signup.

## Changes

- **Domain** — `group.ts`: drop `avatarUrl` from `GroupProfileEdit` + `editProfile`;
  add `Group.setAvatar`. `group-queries.ts`: drop `heroImageUrl` from `GroupDetail`.
- **Application** — `messages.ts`: `SetGroupAvatarCommand`. `group.handler.ts`:
  `SetGroupAvatarHandler`; `CreateGroupHandler` no longer passes `avatarUrl`.
- **Infrastructure** — `supabase-group-query-repository.ts`: drop `hero_image_url`
  from `DETAIL_COLUMNS` / `DetailRow` / `toDetail`.
- **Web** — `handlers.ts` wires `setGroupAvatar`. New
  `group-avatar-panel.tsx` + `groups/[id]/edit/group-avatar-actions.ts`.
  `avatar-upload.tsx` / `avatar-crop-dialog.tsx` gain the optional shape/path props.
  Group edit page swaps `HeroImagePanel` → `GroupAvatarPanel`; group page drops
  `<HeroImage>`. New/edit group forms drop the "Avatar URL" field;
  `group-form-actions.ts` stops reading/sending it.
- **Migration** — `20260831000000_group_avatars_orphan_liveness.sql`.
- **Tests** — `group.test.ts`: `setAvatar` block + `editProfile` decouple.
  `hero-image.authed.spec.ts`: removed the now-dead profile + group hero specs
  (event-edit only remains).

## Patterns observed

- **Shared `avatars` bucket + one walker scoped to N liveness columns** is the
  cheaper alternative to the "one bucket per liveness column" rule of thumb —
  valid precisely because a single walker owns the bucket, so the columns can't
  fight over the same objects (unlike the hero-vs-avatar conflict that drove
  separate buckets in 20260830000000). Captured against AGENTS pattern #14.
- The `UserProfile` avatar/edit split is now the template for any aggregate whose
  image is uploaded out-of-band: a dedicated `setX` + command, never folded into
  the profile-edit command, so a form save can't null an uploaded asset.

## Follow-ups

- `HeroImagePanel` / `hero-image-actions.ts` still carry dead `'profiles' |
'groups'` `EntityType` arms (events is the only live caller now). Left generic;
  prune if a future change touches that component anyway.
- Optional storage reclaim for the orphaned `profiles.hero_image_url` /
  `groups.hero_image_url` columns (no longer shown/editable) — same deferred
  item as the player-hero journal.
