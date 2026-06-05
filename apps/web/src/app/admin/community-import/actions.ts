'use server';

import { revalidatePath } from 'next/cache';
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
import type { ListingDraft } from '@/lib/listing-draft';

const RETURN_PATH = '/admin/community-import';

export type ImportRowResult =
  | { title: string; ok: true; slug: string; geocoded: boolean; action: 'created' | 'updated' }
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
 * external URL updates the existing listing in place rather than creating a
 * duplicate — so the importer is idempotent and an admin can keep one
 * `community-listings.json` as the source of truth. Matching is on
 * `external_url` (see `findByExternalUrl`); an existing listing that's already
 * claimed / removed / under review is left untouched and reported as skipped.
 *
 * Per-row failures don't abort the batch — each row reports its own
 * success/error so the admin can fix and retry just the ones that failed.
 */
export async function importAction(drafts: ListingDraft[]): Promise<ImportResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: 'Admin access required.' };

  const results: ImportRowResult[] = [];
  for (const draft of drafts) {
    try {
      const { dto, geocoded } = await draftToDto(draft);
      const existing = await repositories.communityListingRepo.findByExternalUrl(dto.externalUrl);

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
        await handlers.updateCommunityListing.execute(
          new UpdateCommunityListingCommand(existing.id, admin.userId, dto),
        );
        revalidatePath(`/community/${existing.slug}`);
        results.push({
          title: draft.title,
          ok: true,
          slug: existing.slug,
          geocoded,
          action: 'updated',
        });
      } else {
        const { slug } = await handlers.createCommunityListing.execute(
          new CreateCommunityListingCommand(admin.userId, dto),
        );
        results.push({ title: draft.title, ok: true, slug, geocoded, action: 'created' });
      }
    } catch (err) {
      results.push({ title: draft.title, ok: false, error: messageFor(err) });
    }
  }

  if (results.some((r) => r.ok)) revalidatePath('/community');
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
  const raw = {
    title: d.title,
    description: d.description,
    externalUrl: d.externalUrl,
    externalHostName: d.externalHostName,
    startsAt: zonedWallClockToUtc(d.startsAtLocal, timeZone),
    endsAt: d.endsAtLocal ? zonedWallClockToUtc(d.endsAtLocal, timeZone) : null,
    location,
    timeZone,
    surface: d.surface,
    format: d.format,
    skillLevel: d.skillLevel,
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
