'use server';

import { revalidatePath } from 'next/cache';
import { UpdateBusinessInfoCommand } from '@pickupvb/application';
import { NotFoundError } from '@pickupvb/domain';
import { requireSession } from '@/lib/server-auth';
import { fieldOrNull } from '@/lib/form-data';
import { getUserProfileHandlers } from '@/lib/handlers';

export type BusinessInfoState = {
  error: string | null;
  success: boolean;
};

/**
 * Save the buyer-side business fields rendered on printable receipts.
 * Persisted on `public.profiles` (see 20260523 migration). Tax ID is
 * intended for EIN — we tell users not to use SSN, since this column
 * is not encrypted at rest beyond the database default.
 */
export async function updateBusinessInfo(
  _prev: BusinessInfoState,
  formData: FormData,
): Promise<BusinessInfoState> {
  const { user } = await requireSession();

  const businessName = fieldOrNull(formData, 'business_name', 120);
  const businessAddress = fieldOrNull(formData, 'business_address', 400);
  const taxId = fieldOrNull(formData, 'tax_id', 40);

  try {
    const { updateBusinessInfo: handler } = await getUserProfileHandlers();
    await handler.execute(
      new UpdateBusinessInfoCommand(user.id, { businessName, businessAddress, taxId }),
    );
  } catch (err) {
    if (err instanceof NotFoundError) {
      return { error: 'Profile not found.', success: false };
    }
    return { error: 'Could not save your business info. Please try again.', success: false };
  }

  revalidatePath('/profile/receipts');
  return { error: null, success: true };
}
