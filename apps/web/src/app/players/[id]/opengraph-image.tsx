import { getServerSupabase } from '@/lib/supabase';
import { brandOgImage, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og-image';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Volleyball player on PickupVB';

export default async function Image({ params }: { params: { id: string } }) {
    const supabase = await getServerSupabase();
    const { data } = await supabase
        .from('profiles')
        .select('display_name, first_name, last_name, home_city')
        .eq('id', params.id)
        .maybeSingle();
    const row = data as {
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        home_city: string | null;
    } | null;
    const name = row
        ? [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
        || row.display_name
        || 'Player'
        : 'Player';
    return brandOgImage({
        eyebrow: 'Volleyball player',
        title: name,
        meta: row?.home_city ?? 'PickupVB',
    });
}
