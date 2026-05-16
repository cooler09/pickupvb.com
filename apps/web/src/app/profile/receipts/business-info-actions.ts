'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/server-auth';
import { fieldOrNull } from '@/lib/form-data';

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
    const { supabase, user } = await requireSession();

    const businessName = fieldOrNull(formData, 'business_name', 120);
    const businessAddress = fieldOrNull(formData, 'business_address', 400);
    const taxId = fieldOrNull(formData, 'tax_id', 40);

    const { error } = await supabase
        .from('profiles')
        .update({
            business_name: businessName,
            business_address: businessAddress,
            tax_id: taxId,
        } as never)
        .eq('id', user.id);

    if (error) {
        return { error: error.message, success: false };
    }

    revalidatePath('/profile/receipts');
    return { error: null, success: true };
}
