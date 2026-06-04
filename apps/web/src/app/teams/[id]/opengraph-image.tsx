import { getServerSupabase } from '@/lib/supabase';
import { brandOgImage, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og-image';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Volleyball team on PickupVB';

export default async function Image({ params }: { params: { id: string } }) {
  const supabase = await getServerSupabase();
  const { data } = await supabase.from('teams').select('name').eq('id', params.id).maybeSingle();
  const row = data as { name: string } | null;
  return brandOgImage({
    eyebrow: 'Team',
    title: row?.name ?? 'Team',
    meta: 'PickupVB',
  });
}
