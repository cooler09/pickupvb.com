'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  DeleteCommunityListingCommand,
  HideCommunityListingCommand,
  ReportCommunityListingCommand,
  UnhideCommunityListingCommand,
} from '@pickupvb/application';
import { ConflictError, NotFoundError, UnauthorizedError } from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { field } from '@/lib/form-data';
import { requireRealUser } from '@/lib/server-auth';

/**
 * Flash-param redirect back to a community listing detail page.
 *
 * Codes:
 *   reported  — report recorded
 *   already   — viewer has already reported this listing
 *   hidden    — listing hidden by submitter/admin
 *   unhidden  — listing restored
 *   removed   — listing deleted (redirects to /community instead)
 *   notallow  — viewer isn't allowed to perform that action
 *   notfound  — listing no longer exists
 *   error     — anything else
 */
function back(slug: string, code: string): never {
  redirect(`/community/${slug}?notice=${code}`);
}

export async function reportListing(listingId: string, slug: string): Promise<void> {
  const { user } = await requireRealUser(`/community/${slug}`);
  try {
    await handlers.reportCommunityListing.execute(
      new ReportCommunityListingCommand(listingId, user.id, null),
    );
  } catch (err) {
    if (err instanceof ConflictError) back(slug, 'already');
    if (err instanceof NotFoundError) back(slug, 'notfound');
    throw err;
  }
  revalidatePath(`/community/${slug}`);
  back(slug, 'reported');
}

export async function hideListing(listingId: string, slug: string): Promise<void> {
  const { user } = await requireRealUser(`/community/${slug}`);
  try {
    await handlers.hideCommunityListing.execute(
      new HideCommunityListingCommand(listingId, user.id),
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) back(slug, 'notallow');
    if (err instanceof NotFoundError) back(slug, 'notfound');
    throw err;
  }
  revalidatePath(`/community/${slug}`);
  revalidatePath('/community');
  back(slug, 'hidden');
}

export async function unhideListing(listingId: string, slug: string): Promise<void> {
  const { user } = await requireRealUser(`/community/${slug}`);
  try {
    await handlers.unhideCommunityListing.execute(
      new UnhideCommunityListingCommand(listingId, user.id),
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) back(slug, 'notallow');
    if (err instanceof NotFoundError) back(slug, 'notfound');
    throw err;
  }
  revalidatePath(`/community/${slug}`);
  revalidatePath('/community');
  back(slug, 'unhidden');
}

export async function deleteListing(listingId: string, slug: string): Promise<void> {
  const { user } = await requireRealUser(`/community/${slug}`);
  try {
    await handlers.deleteCommunityListing.execute(
      new DeleteCommunityListingCommand(listingId, user.id),
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) back(slug, 'notallow');
    if (err instanceof NotFoundError) {
      revalidatePath('/community');
      redirect('/community?notice=removed');
    }
    throw err;
  }
  revalidatePath('/community');
  redirect('/community?notice=removed');
}

// FormData adapters so plain <form action={...}> elements can submit without
// needing a bound client component. The listing id + slug are passed via
// .bind() at the JSX call site.
export async function reportListingFromForm(
  listingId: string,
  slug: string,
  _formData: FormData,
): Promise<void> {
  await reportListing(listingId, slug);
}

export async function hideListingFromForm(
  listingId: string,
  slug: string,
  _formData: FormData,
): Promise<void> {
  await hideListing(listingId, slug);
}

export async function unhideListingFromForm(
  listingId: string,
  slug: string,
  _formData: FormData,
): Promise<void> {
  await unhideListing(listingId, slug);
}

export async function deleteListingFromForm(
  listingId: string,
  slug: string,
  formData: FormData,
): Promise<void> {
  // Defensive: require the confirm checkbox to be checked.
  if (field(formData, 'confirm') !== 'on') back(slug, 'error');
  await deleteListing(listingId, slug);
}
