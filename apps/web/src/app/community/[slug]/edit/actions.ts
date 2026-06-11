'use server';

import { redirect } from 'next/navigation';
import { revalidatePath, updateTag } from 'next/cache';
import { UpdateCommunityListingSchema } from '@pickupvb/types';
import { UpdateCommunityListingCommand } from '@pickupvb/application';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { requireRealUser } from '@/lib/server-auth';
import { communityListingCacheTag } from '@/lib/cache-tags';
import {
  parseCommunityListingForm,
  type CommunityListingFormState,
} from '@/app/community/_lib/parse-community-listing-form';

export type EditCommunityListingState = CommunityListingFormState;

export async function editCommunityListingAction(
  listingId: string,
  slug: string,
  _prev: CommunityListingFormState,
  formData: FormData,
): Promise<CommunityListingFormState> {
  const viewer = await requireRealUser(`/community/${slug}/edit`);

  const parsed = await parseCommunityListingForm(formData, UpdateCommunityListingSchema);
  if (!parsed.ok) return parsed.state;

  try {
    await handlers.updateCommunityListing.execute(
      new UpdateCommunityListingCommand(listingId, viewer.user.id, parsed.dto),
    );
  } catch (err) {
    if (err instanceof NotFoundError) {
      redirect('/community?notice=notfound');
    }
    if (err instanceof UnauthorizedError) {
      redirect(`/community/${slug}?notice=notallow`);
    }
    if (err instanceof ConflictError) {
      return { error: err.message };
    }
    if (err instanceof ValidationError) {
      return { error: err.message };
    }
    const message = err instanceof Error ? err.message : 'Failed to update listing.';
    return { error: message };
  }

  updateTag(communityListingCacheTag(slug));
  revalidatePath('/community');
  revalidatePath(`/community/${slug}`);
  redirect(`/community/${slug}?notice=updated`);
}
