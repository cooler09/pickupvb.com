# Hero Images Audit / Proposal

**Date:** 2026-05-24
**Scope:** Events, groups, and public profiles. Design proposal for adding wide hero / cover images that users can upload.

This is a feature-evaluation note, not a code-quality audit. It captures the requested proposal, tradeoffs, and a recommended rollout shape so the idea can be revisited without re-deriving the analysis.

> 2026-05-26 remediation update (Bundle 95):
>
> - P3 #2 from data-lifecycle is now shipped via
>   [supabase/migrations/20260630000000_hero_images_orphan_cleanup.sql](../../supabase/migrations/20260630000000_hero_images_orphan_cleanup.sql).
> - Added `public.purge_hero_image_orphans(grace_hours int)` plus daily
>   pg_cron schedule `hero_images_purge_orphans` (06:00 UTC).
> - The walker inspects `storage.objects` in bucket `hero-images`, parses
>   `{user_id}/{entity_type}/{entity_id}/hero.{ext}` path segments, and
>   removes objects that no longer map to a live owner row + active
>   `hero_image_url` pointer.
> - A 24-hour grace window prevents racing upload flows where object write
>   and row update are not strictly atomic.

---

## Summary

The product currently uses `avatar_url` fields for events, groups, and profiles, but those are plain URL inputs. There is no upload flow in the app yet. Adding hero images would therefore be a new upload system, not a small extension of an existing one.

Recommended shape:

- Add a single wide hero image per entity.
- Start with events, then reuse the same component for groups and profiles.
- Keep it free initially; do not gate it behind Pro.
- Use Supabase Storage for uploads and `next/image` for display.

---

## What Exists Today

- `avatar_url` is already present on the relevant tables.
- The current UI uses pasted URLs, not file uploads.
- Supabase Storage is already part of the stack, so the infrastructure choice is consistent.
- Next.js already allows Supabase-hosted images via remote image patterns.

That means the missing work is the upload UX, storage policy, and schema additions for hero fields.

---

## Proposed Feature

Add a banner-style image at the top of:

- event detail pages
- group pages
- public profile pages

The hero image should be visually distinct from the avatar/logo. A practical default is a 3:1 banner such as 1200×400, with `object-cover` display and a branded fallback gradient when unset.

### Suggested schema

- `events.hero_image_url text`
- `groups.hero_image_url text`
- `profiles.hero_image_url text`

### Suggested storage

- New public-read bucket for hero images.
- Authenticated writes only.
- Path convention by entity type and id, for example:
  - `events/{event_id}/hero.{ext}`
  - `groups/{group_id}/hero.{ext}`
  - `profiles/{user_id}/hero.{ext}`

### Suggested UI

- A reusable upload component with preview, file validation, and progress state.
- Accept JPEG, PNG, and WebP.
- Enforce a file-size cap.
- Use the returned public URL in the form state.

### Suggested rendering

- Use `next/image` for optimization.
- Prioritize event detail pages above the fold.
- Lazily load hero images on lower-priority pages.
- Fall back to a brand gradient or placeholder illustration when absent.

---

## Pros

- Makes events and groups feel more polished and real.
- Improves share cards if hero images feed `og:image`.
- Gives organizers a clear branding surface.
- Creates a reusable upload primitive for later media features.
- Visually upgrades the public face of the product without changing core workflows.

---

## Cons / Risks

- There is no moderation infrastructure yet, so user-uploaded images create policy and abuse risk.
- Upload UX is substantially more complex than the current URL-only avatar fields.
- Large images can affect bandwidth and page performance if optimization is not handled carefully.
- If only some entities get hero images, the product can feel uneven until the feature is fully rolled out.
- Once hero uploads exist, the existing URL-only avatar flow may feel incomplete and should probably be revisited.

---

## Recommendation

Ship this in phases, starting with events.

Phase 1:

- events only
- upload component
- storage bucket and policies
- hero rendering
- `og:image` wiring

Phase 2:

- groups reuse

Phase 3:

- profiles reuse
- reconsider avatar uploads as a follow-up consistency pass

Do not gate hero images behind Pro at launch. The feature has more value as a platform-quality upgrade than as a monetization lever.

---

## Decided Defaults

- Display-time cropping only. Use `object-cover` in the page layout instead of enforcing a crop at upload time. That keeps the first release simpler and avoids building a cropper before we know users want one.
- Manual report-and-review is enough for v1 moderation.
- Cleanup should be asynchronous when a hero image is deleted. The immediate delete path should clear the row field first, then let storage cleanup happen out of band.
- Profiles should get the feature too. There is no strong reason to exclude them once the upload primitive exists; public profiles are a brand surface just like events and groups, and the incremental cost is mainly one more column plus reuse of the same component.

The only real reason to exclude profiles would be if we wanted to minimize the number of public surfaces carrying user-uploaded media in v1. Since moderation is accepted and cleanup is asynchronous, that tradeoff is no longer compelling.
