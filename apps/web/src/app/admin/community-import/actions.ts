'use server';

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { CreateCommunityListingSchema, type CreateCommunityListingDto } from '@pickupvb/types';
import { CreateCommunityListingCommand } from '@pickupvb/application';
import { ValidationError } from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { requireRealUser } from '@/lib/server-auth';
import { isPlatformAdmin } from '@/lib/admin';
import { geocodeAddress } from '@/lib/geocode';
import { timeZoneForCoords } from '@/lib/timezone';
import type { ListingDraft } from '@/lib/listing-draft';

const RETURN_PATH = '/admin/community-import';

export type ImportRowResult =
  | { title: string; ok: true; slug: string; geocoded: boolean }
  | { title: string; ok: false; error: string };

export type ImportResult = { ok: true; results: ImportRowResult[] } | { ok: false; error: string };

/** Re-checks platform-admin on every action — the page guard is not the boundary. */
async function requireAdmin(): Promise<{ userId: string } | null> {
  const viewer = await requireRealUser(RETURN_PATH);
  if (!(await isPlatformAdmin(viewer.user.id))) return null;
  return { userId: viewer.user.id };
}

/**
 * Geocode + validate + create each reviewed draft. Per-row failures
 * don't abort the batch — each row reports its own success/error so the admin
 * can fix and retry just the ones that failed.
 */
export async function importAction(drafts: ListingDraft[]): Promise<ImportResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: 'Admin access required.' };

  const results: ImportRowResult[] = [];
  for (const draft of drafts) {
    try {
      const { dto, geocoded } = await draftToDto(draft);
      const { slug } = await handlers.createCommunityListing.execute(
        new CreateCommunityListingCommand(admin.userId, dto),
      );
      results.push({ title: draft.title, ok: true, slug, geocoded });
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
  const raw = {
    title: d.title,
    description: d.description,
    externalUrl: d.externalUrl,
    externalHostName: d.externalHostName,
    startsAt: d.startsAtLocal,
    endsAt: d.endsAtLocal || null,
    location,
    timeZone:
      location && hasCoords
        ? timeZoneForCoords(location.latitude as number, location.longitude as number)
        : null,
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
