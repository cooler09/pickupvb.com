'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  ApproveCommunityListingClaimCommand,
  ClaimCommunityListingCommand,
  DeleteCommunityListingCommand,
  HideCommunityListingCommand,
  RejectCommunityListingClaimCommand,
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
 *   claimproposed  — claim filed and awaiting review
 *   claimapproved  — pending claim approved
 *   claimrejected  — pending claim rejected
 *   claimfail — claim/approve/reject blocked by conflict or auth
 *   notallow  — viewer isn't allowed to perform that action
 *   notfound  — listing no longer exists
 *   error     — anything else
 */
function back(slug: string, code: string): never {
  redirect(`/community/${slug}?notice=${code}`);
}

export async function reportListing(
  listingId: string,
  slug: string,
  reason: string | null,
): Promise<void> {
  const { user } = await requireRealUser(`/community/${slug}`);
  const truncatedReason = reason ? reason.slice(0, 500) : null;
  try {
    await handlers.reportCommunityListing.execute(
      new ReportCommunityListingCommand(listingId, user.id, truncatedReason),
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
    if (err instanceof ConflictError) back(slug, 'claimfail');
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
  formData: FormData,
): Promise<void> {
  const reason = field(formData, 'reason') ?? null;
  await reportListing(listingId, slug, reason);
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

export async function claimListing(
  listingId: string,
  slug: string,
  eventId: string,
): Promise<void> {
  const { user } = await requireRealUser(`/community/${slug}`);
  if (!eventId) back(slug, 'error');
  try {
    await handlers.claimCommunityListing.execute(
      new ClaimCommunityListingCommand(listingId, user.id, eventId),
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) back(slug, 'claimfail');
    if (err instanceof ConflictError) back(slug, 'claimfail');
    if (err instanceof NotFoundError) back(slug, 'notfound');
    throw err;
  }
  revalidatePath(`/community/${slug}`);
  revalidatePath('/community');
  back(slug, 'claimproposed');
}

export async function approveListingClaim(listingId: string, slug: string): Promise<void> {
  const { user } = await requireRealUser(`/community/${slug}`);
  try {
    await handlers.approveCommunityListingClaim.execute(
      new ApproveCommunityListingClaimCommand(listingId, user.id),
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) back(slug, 'notallow');
    if (err instanceof ConflictError) back(slug, 'claimfail');
    if (err instanceof NotFoundError) back(slug, 'notfound');
    throw err;
  }
  revalidatePath(`/community/${slug}`);
  revalidatePath('/community');
  back(slug, 'claimapproved');
}

export async function rejectListingClaim(listingId: string, slug: string): Promise<void> {
  const { user } = await requireRealUser(`/community/${slug}`);
  try {
    await handlers.rejectCommunityListingClaim.execute(
      new RejectCommunityListingClaimCommand(listingId, user.id),
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) back(slug, 'notallow');
    if (err instanceof ConflictError) back(slug, 'claimfail');
    if (err instanceof NotFoundError) back(slug, 'notfound');
    throw err;
  }
  revalidatePath(`/community/${slug}`);
  revalidatePath('/community');
  back(slug, 'claimrejected');
}

export async function claimListingFromForm(
  listingId: string,
  slug: string,
  formData: FormData,
): Promise<void> {
  const raw = field(formData, 'event_id').trim();
  // Lightweight UUID shape check so we surface a friendly error before hitting the DB.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
  if (!isUuid) back(slug, 'claimfail');
  await claimListing(listingId, slug, raw);
}

export async function approveListingClaimFromForm(
  listingId: string,
  slug: string,
  _formData: FormData,
): Promise<void> {
  await approveListingClaim(listingId, slug);
}

export async function rejectListingClaimFromForm(
  listingId: string,
  slug: string,
  _formData: FormData,
): Promise<void> {
  await rejectListingClaim(listingId, slug);
}
