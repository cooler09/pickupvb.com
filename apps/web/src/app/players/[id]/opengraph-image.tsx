import { SupabaseProfileRepository } from '@pickupvb/infrastructure';
import { getServerSupabase } from '@/lib/supabase';
import { brandOgImage, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og-image';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Volleyball player on PickupVB';

export default async function Image({ params }: { params: { id: string } }) {
  // The `/players/[id]` route segment is the player's vanity handle (the page
  // looks it up by handle), so resolve by handle here too. The previous
  // `.eq('id', params.id)` never matched a UUID, so OG cards always fell back
  // to the generic name/city.
  const profiles = new SupabaseProfileRepository(await getServerSupabase());
  const card = await profiles.findCardByHandle(params.id);
  const name = card?.displayName || 'Player';
  return brandOgImage({
    eyebrow: 'Volleyball player',
    title: name,
    meta: card?.homeCity ?? 'PickupVB',
  });
}
