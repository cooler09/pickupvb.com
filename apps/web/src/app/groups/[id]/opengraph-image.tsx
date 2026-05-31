import { SupabaseGroupQueryRepository } from '@pickupvb/infrastructure';
import { getServerSupabase } from '@/lib/supabase';
import { brandOgImage, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og-image';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Volleyball group on PickupVB';

export default async function Image({ params }: { params: { id: string } }) {
  const supabase = await getServerSupabase();
  // The `[id]` route segment is the group slug (the detail page reads
  // `.eq('slug', …)`); resolve it the same way so the OG image actually
  // finds the group instead of querying the `id` column with a slug.
  const group = await new SupabaseGroupQueryRepository(supabase).findDetailBySlug(params.id);
  const place = group ? [group.homeCity, group.region].filter(Boolean).join(', ') : '';
  return brandOgImage({
    eyebrow: 'Volleyball group',
    title: group?.name ?? 'Group',
    meta: place || 'PickupVB',
  });
}
