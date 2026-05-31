-- ============================================================================
-- Sponsor logos — Supabase Storage bucket for host-uploaded sponsor logos.
-- Mirrors the `hero-images` bucket (20260625000000_hero_images.sql): public
-- read, authenticated owner-prefix write.
--
-- Context: sponsor logos were previously a free-text `event_sponsors.logo_url`
-- pointing at an arbitrary third-party CDN. Those URLs fail two independent
-- browser walls we can't fix from our side — the CSP `img-src` allowlist in
-- apps/web/next.config.mjs (every sponsor CDN would need allowlisting, which
-- is unbounded) and cross-origin embedding protections (CORP / hotlink /
-- referer / signed-URL expiry on the sponsor's host). Self-hosting the asset
-- in our own bucket makes the served URL `https://<ref>.supabase.co/...`,
-- which is already on the `img-src` allowlist and `images.remotePatterns`,
-- so the logo loads with zero CSP/CORS surprises. The logo column stays a
-- `text` URL; only the *source* of that URL changes (upload, not paste).
--
-- Impact: additive only — one new public Storage bucket plus its RLS policies.
-- No schema changes to `event_sponsors`; `logo_url` keeps its `^https://`
-- check and now holds a supabase Storage public URL. Path convention:
-- `{user_id}/{event_id}/logo.{ext}`. Orphan cleanup (re-upload with a
-- different extension, sponsor removal) is deferred — mirror the
-- `hero-images` walker (20260630000000_hero_images_orphan_cleanup.sql) in a
-- follow-up if leakage matters.
-- ============================================================================

-- Storage bucket (public = anyone can read the served URLs)
insert into storage.buckets (id, name, public)
values ('sponsor-logos', 'sponsor-logos', true)
on conflict (id) do nothing;

-- Public read: any visitor can load sponsor logos on the public event page.
create policy "sponsor logos public read"
  on storage.objects for select
  to public
  using (bucket_id = 'sponsor-logos');

-- Authenticated write: users can only write inside their own user_id path
-- prefix. Path convention: {user_id}/{event_id}/logo.{ext}
create policy "sponsor logos owner insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'sponsor-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "sponsor logos owner update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'sponsor-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "sponsor logos owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'sponsor-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
