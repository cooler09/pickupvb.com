# Sponsor-logo uploads + hero-walker data-loss fix (2026-05-30)

## Context

The event sponsor slot stored its logo as a free-text `event_sponsors.logo_url`
pointing at an arbitrary third-party CDN, rendered through `next/image`. In
practice those logos frequently failed to load against **two independent
browser walls we can't control per-host**:

- **CSP `img-src`** ([next.config.mjs](../../apps/web/next.config.mjs#L63)) only
  allowlists `self`/`data:`/`blob:`/supabase/OSM/vercel. Any sponsor CDN is
  blocked, and the set of sponsor CDNs is unbounded — you can't allowlist it.
- **Cross-origin embedding** — even an allowlisted host can send
  `Cross-Origin-Resource-Policy`, hotlink/referer protection, or expiring
  signed URLs. Not fixable from our origin.

The user asked whether to switch to host-uploaded logos instead of chasing
CDNs. Yes — and the repo already had the exact pattern in the hero-image
feature (Storage bucket + browser-client upload). Self-hosting makes the URL
`*.supabase.co`, which is already on the `img-src` allowlist and
`images.remotePatterns`, so the whole CSP/CORS class disappears with **zero
config change**.

While writing the sponsor orphan-cleanup walker (modelled on the hero walker),
found a **P1 data-loss defect in the shipped hero walker** — see Patterns.

## Decisions

- **Upload-only, drop the free-text URL field** (user choice). Keeps `logo_url`
  always a supabase URL we control; removes the CSP/CORS failure mode entirely
  rather than leaving a paste-a-URL fallback that reintroduces it.
- **New dedicated `sponsor-logos` bucket** (user choice) over reusing
  `hero-images` with a `'sponsors'` entity type. Cleaner lifecycle / orphan-sweep
  separation; one extra migration.
- **Client-uploads-to-Storage, mirror URL into a hidden `logo_url` input** over
  a native file input posted to the server action. Reuses the proven
  browser-client + RLS-owner-prefix pattern, keeps `logo_url` a plain string, and
  needs **zero changes** to `upsertSponsorFromForm` / the à-la-carte checkout
  path (both already read `field(formData, 'logo_url')`). Trade-off: the file
  uploads before the row is saved/paid, so an abandoned checkout leaks an object
  — handled by the orphan sweep.
- **Sponsor panel stays a Server Component**; embedded the client uploader
  rather than lifting the whole panel to `'use client'` (AGENTS.md: lift only
  when needed). The hidden input still participates in the native form submit.
- **Graded the hero walker bug P1** (silent data-loss of user content), even
  though it's a defect in a prior P3 remediation. Fixed via a new
  `create or replace` migration — never edit the applied one.

## Changes

- [20260817000000_sponsor_logos_bucket.sql](../../supabase/migrations/20260817000000_sponsor_logos_bucket.sql)
  — new public `sponsor-logos` bucket; public-read / owner-prefix-write RLS
  (mirrors `hero-images`). Path `{user_id}/{event_id}/logo.{ext}`.
- [20260818000000_sponsor_logos_orphan_cleanup.sql](../../supabase/migrations/20260818000000_sponsor_logos_orphan_cleanup.sql)
  — `purge_sponsor_logo_orphans(grace_hours)` + daily 06:15 UTC pg_cron;
  cache-buster-tolerant liveness match.
- [20260819000000_fix_hero_image_orphan_cache_buster.sql](../../supabase/migrations/20260819000000_fix_hero_image_orphan_cache_buster.sql)
  — `create or replace` of `purge_hero_image_orphans` with the cache-buster
  guard on all three branches; existing cron picks up the new body.
- [sponsor-logo-upload.tsx](../../apps/web/src/app/events/[id]/edit/sponsor-logo-upload.tsx)
  — new `'use client'` uploader; writes the Storage public URL into a hidden
  `logo_url` input.
- [sponsor-panel.tsx](../../apps/web/src/app/events/[id]/edit/sponsor-panel.tsx)
  — replaced the free-text "Logo image URL" field with the uploader; added a
  `userId` prop.
- [edit/page.tsx](../../apps/web/src/app/events/[id]/edit/page.tsx#L173-L177)
  — threads `user.id` into `SponsorPanel`.
- [data-lifecycle.md](../audits/data-lifecycle.md) / [audits/README.md](../audits/README.md)
  — status block, §2 notes, backlog rows (P1 #2, P3 #7), index date.

## Patterns observed

- **Cache-busted Storage URLs break naive orphan-walker liveness checks.** Both
  upload widgets persist `?t=<ms>` to defeat the CDN cache. A liveness match of
  `url like '%/' || object_name` (no trailing wildcard) therefore **never**
  matches a live row — the suffix sits past `object_name` — so the walker
  flags every live object as an orphan and deletes it after the grace window.
  The hero walker (20260630000000) shipped with exactly this bug; the sponsor
  walker avoided it and the hero one is now fixed. **Rule for any future
  storage-orphan sweep: match the bare path OR `… || '?%'`.** Candidate for
  AGENTS.md's "Patterns surfaced by audits" if a third Storage feature lands —
  deferred to the maintainer's call.
- **A storage-only / cron-only migration is invisible to the verify quad.**
  `typecheck && lint && test && build` never touches SQL, so a syntax error
  would only surface on the CI auto-apply (or `pnpm db:migrate`). Bucket
  migrations also don't change `database.types.ts`, so no `gen:types` is needed
  — which is why typecheck passed without regen.

## Follow-ups

- **Apply all three migrations locally** (`pnpm db:migrate`) once Docker is up —
  blocked at authoring time (Docker daemon down). Storage/cron only, no
  `gen:types`. CI auto-applies on deploy regardless.
- **Confirm the hero `hero_images_purge_orphans` cron is actually scheduled in
  prod** and check whether any live hero images were already purged before the
  fix lands (unrecoverable if so). Tracked in
  [data-lifecycle.md](../audits/data-lifecycle.md) P1 #2.
- **Orphan leakage on abandoned à-la-carte checkout** — the logo uploads before
  the Stripe redirect, so a canceled unlock leaves an object until the daily
  sweep collects it. Acceptable for v1; noted in the migration preamble.

## Verify

- Standard quad green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
  (8/8 build tasks cached/successful; the only lint warnings are pre-existing
  and in unrelated files — scoreboard effects, domain/infra test files).
- SQL **not** executed against a live DB (Docker down). The two new walkers
  mirror the proven hero walker structure; the hero fix is a minimal
  `create or replace`.

## Risks

- The three migrations are unapplied locally. If any has a SQL error it will
  surface on the next `pnpm db:migrate` / CI apply, not in the verify quad.
  Rollback for the hero fix is trivial (re-`create or replace` the prior body),
  but doing so re-opens the data-loss bug — prefer fixing forward.
