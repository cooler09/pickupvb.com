'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { CreateCommunityListingSchema } from '@pickupvb/types';
import { CreateCommunityListingCommand } from '@pickupvb/application';
import { RateLimitError, ValidationError } from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { requireRealUser } from '@/lib/server-auth';
import {
  parseCommunityListingForm,
  type CommunityListingFormState,
} from '@/app/community/_lib/parse-community-listing-form';

export type CreateCommunityListingState = CommunityListingFormState;

export async function createCommunityListingAction(
  _prev: CommunityListingFormState,
  formData: FormData,
): Promise<CommunityListingFormState> {
  const viewer = await requireRealUser('/community/new');

  const parsed = await parseCommunityListingForm(formData, CreateCommunityListingSchema);
  if (!parsed.ok) return parsed.state;

  let result: { id: string; slug: string };
  try {
    result = await handlers.createCommunityListing.execute(
      new CreateCommunityListingCommand(viewer.user.id, parsed.dto),
    );
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { error: "You've reached the daily submission limit. Try again tomorrow." };
    }
    if (err instanceof ValidationError) {
      return { error: err.message };
    }
    const message = err instanceof Error ? err.message : 'Failed to submit listing.';
    return { error: message };
  }

  revalidatePath('/community');
  redirect(`/community/${result.slug}?notice=submitted`);
}
