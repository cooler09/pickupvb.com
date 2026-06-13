'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { ZodError } from 'zod';
import { CreateCommunityListingSchema, type CreateCommunityListingDto } from '@pickupvb/types';
import {
  CreateCommunityListingCommand,
  UpdateCommunityListingCommand,
} from '@pickupvb/application';
import { ValidationError } from '@pickupvb/domain';
import { handlers, repositories } from '@/lib/handlers';
import { requireRealUser } from '@/lib/server-auth';
import { isPlatformAdmin } from '@/lib/admin';
import { geocodeAddress } from '@/lib/geocode';
import { timeZoneForCoords, zonedWallClockToUtc } from '@/lib/timezone';
import { communityListingCacheTag } from '@/lib/cache-tags';
import type { ListingDraft } from '@/lib/listing-draft';
import { dtoMatchesListing } from './listing-diff';

const RETURN_PATH = '/admin/community-import';

/**
 * How many rows to geocode concurrently. Geocoding is the per-row latency cost
 * (a MapTiler round-trip); fanning it out keeps even a large batch well under
 * the function timeout. The client also chunks the upload (see import-client),
 * so this bounds in-flight geocodes within each chunk.
 */
const GEOCODE_CONCURRENCY = 6;

/** Map with a bounded number of in-flight async tasks, preserving input order. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

export type ImportRowResult =
  | {
      title: string;
      ok: true;
      slug: string;
      geocoded: boolean;
      /** `unchanged` = an existing listing already matched the draft, so no write. */
      action: 'created' | 'updated' | 'unchanged';
      /** True when the upserted row is currently hidden (won't show publicly). */
      hidden: boolean;
    }
  | { title: string; ok: false; error: string };

export type ImportResult = { ok: true; results: ImportRowResult[] } | { ok: false; error: string };

/** Re-checks platform-admin on every action — the page guard is not the boundary. */
async function requireAdmin(): Promise<{ userId: string } | null> {
  const viewer = await requireRealUser(RETURN_PATH);
  if (!(await isPlatformAdmin(viewer.user.id))) return null;
  return { userId: viewer.user.id };
}

/**
 * Geocode + validate + **upsert** each reviewed draft. Re-importing the same
 * event updates the existing listing in place rather than creating a duplicate —
 * so the importer is idempotent and an admin can keep one
 * `community-listings.json` as the source of truth. Matching is on
 * `(external_url, starts_at)` (see `findByExternalUrl`) — keyed on the date too
 * so a series can share one landing-page URL across stops without collapsing; an
 * existing listing that's already claimed / removed / under review is left
 * untouched and reported as skipped.
 *
 * Per-row failures don't abort the batch — each row reports its own
 * success/error so the admin can fix and retry just the ones that failed.
 */
export async function importAction(drafts: ListingDraft[]): Promise<ImportResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: 'Admin access required.' };

  // Phase 1 — geocode + validate every row up front, fanned out so the slow
  // per-row geocode doesn't serialize. Failures are captured per row (never
  // thrown) so one bad address can't abort the batch.
  const prepared = await mapWithConcurrency(drafts, GEOCODE_CONCURRENCY, async (draft) => {
    try {
      const { dto, geocoded } = await draftToDto(draft);
      return { draft, dto, geocoded } as const;
    } catch (err) {
      return { draft, error: messageFor(err) } as const;
    }
  });

  // Phase 2 — upsert sequentially (DB writes are fast, and the read-then-write
  // upsert stays race-free one row at a time).
  const results: ImportRowResult[] = [];
  for (const p of prepared) {
    if ('error' in p) {
      results.push({ title: p.draft.title, ok: false, error: p.error });
      continue;
    }
    const { draft, dto, geocoded } = p;
    try {
      const existing = await repositories.communityListingRepo.findByExternalUrl(
        dto.externalUrl,
        dto.startsAt,
      );

      if (existing) {
        // Don't silently overwrite a listing that's left the editable states —
        // a claimed/removed/pending listing is no longer a plain import target.
        if (existing.status !== 'active' && existing.status !== 'hidden') {
          results.push({
            title: draft.title,
            ok: false,
            error: `Skipped — an existing listing for this URL is ${existing.status.replace('_', ' ')}.`,
          });
          continue;
        }
        // Skip a no-op update: if the stored listing already matches the draft,
        // report it "unchanged" rather than churning the row (and its caches) on
        // every re-import. Only events that actually differ get written.
        const current = await repositories.communityListingRepo.findById(existing.id);
        if (current && dtoMatchesListing(current, dto)) {
          results.push({
            title: draft.title,
            ok: true,
            slug: existing.slug,
            geocoded,
            action: 'unchanged',
            hidden: existing.status === 'hidden',
          });
          continue;
        }
        await handlers.updateCommunityListing.execute(
          new UpdateCommunityListingCommand(existing.id, admin.userId, dto),
        );
        updateTag(communityListingCacheTag(existing.slug));
        revalidatePath(`/community/${existing.slug}`);
        results.push({
          title: draft.title,
          ok: true,
          slug: existing.slug,
          geocoded,
          action: 'updated',
          // An update leaves status untouched — flag hidden rows so the admin
          // knows the listing won't reappear publicly until it's un-hidden.
          hidden: existing.status === 'hidden',
        });
      } else {
        const { slug } = await handlers.createCommunityListing.execute(
          new CreateCommunityListingCommand(admin.userId, dto),
        );
        results.push({
          title: draft.title,
          ok: true,
          slug,
          geocoded,
          action: 'created',
          hidden: false,
        });
      }
    } catch (err) {
      results.push({ title: draft.title, ok: false, error: messageFor(err) });
    }
  }

  // Only bust the public list cache when something actually changed.
  if (results.some((r) => r.ok && r.action !== 'unchanged')) revalidatePath('/community');
  return { ok: true, results };
}

/**
 * Map a reviewed draft to a `CreateCommunityListingDto`, reusing the geocode →
 * timezone → schema pipeline the manual create form uses
 * (`apps/web/src/app/community/new/actions.ts`) — with one deliberate
 * difference: a geocode miss is **non-fatal** here. The manual form makes the
 * submitter fix an unresolvable address; the bulk importer instead keeps the
 * address text and stores no coordinates, so one bad street address doesn't
 * block the whole row (the listing shows its address but is absent from the
 * map / distance search until coords are added). The returned `geocoded` flag
 * lets the importer flag those rows for the admin.
 *
 * Throws `ValidationError` / `ZodError` for genuinely invalid rows that
 * `importAction` turns into a row error.
 */
async function draftToDto(
  d: ListingDraft,
): Promise<{ dto: CreateCommunityListingDto; geocoded: boolean }> {
  const hasAnyAddress = Boolean(d.addressLine || d.city || d.region || d.postalCode || d.country);

  let location: CreateCommunityListingDto['location'] = null;
  let geocoded = true;
  if (hasAnyAddress) {
    if (!d.city || !d.country) {
      throw new ValidationError('City and country are required when a location is provided.');
    }
    let coords: { latitude: number; longitude: number } | null = null;
    // Exact venue coordinates from the source (e.g. the Volleyball Life API) win
    // — use them directly and skip the MapTiler call. Precise pin, no quota burn,
    // and no risk of a forward-geocode landing on the wrong same-named place.
    if (
      d.latitude != null &&
      d.longitude != null &&
      Number.isFinite(d.latitude) &&
      Number.isFinite(d.longitude)
    ) {
      coords = { latitude: d.latitude, longitude: d.longitude };
    } else {
      try {
        coords = await geocodeAddress({
          addressLine: d.addressLine ?? '',
          city: d.city,
          region: d.region ?? '',
          postalCode: d.postalCode ?? '',
          country: d.country,
        });
      } catch {
        // Address didn't resolve — keep it as text, store no point.
        coords = null;
        geocoded = false;
      }
    }
    location = {
      addressLine: d.addressLine,
      city: d.city,
      region: d.region,
      postalCode: d.postalCode,
      country: d.country,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
    };
  }

  const hasCoords = location?.latitude != null && location?.longitude != null;
  const timeZone =
    location && hasCoords
      ? timeZoneForCoords(location.latitude as number, location.longitude as number)
      : null;

  // `startsAtLocal` / `endsAtLocal` are venue-local wall-clock with no zone.
  // Anchor them in the venue timezone before persisting — otherwise the naive
  // string is parsed in the server's zone (UTC on Vercel) and the listing shows
  // hours off (the 5am-vs-9am bug). Falls back to UTC when there's no geocoded
  // zone. See `zonedWallClockToUtc`.
  //
  // All-day listings know only the date: ignore any clock time on the draft and
  // anchor at NOON venue-local — a sentinel that keeps the calendar date stable
  // across every viewer's timezone (noon-UTC lands on the same date worldwide).
  // The end time is dropped too (it's not known when the start isn't).
  const startLocal = d.allDay ? `${d.startsAtLocal.slice(0, 10)}T12:00` : d.startsAtLocal;
  const raw = {
    title: d.title,
    description: d.description,
    externalUrl: d.externalUrl,
    externalHostName: d.externalHostName,
    startsAt: zonedWallClockToUtc(startLocal, timeZone),
    endsAt: d.allDay ? null : d.endsAtLocal ? zonedWallClockToUtc(d.endsAtLocal, timeZone) : null,
    allDay: d.allDay,
    location,
    timeZone,
    surface: d.surface,
    format: d.format,
    skillLevel: d.skillLevel,
    eventType: d.eventType,
    gender: d.gender,
  };

  return { dto: CreateCommunityListingSchema.parse(raw), geocoded };
}

function messageFor(err: unknown): string {
  if (err instanceof ZodError) {
    return err.issues.map((i) => `${i.path.join('.') || 'field'}: ${i.message}`).join('; ');
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
