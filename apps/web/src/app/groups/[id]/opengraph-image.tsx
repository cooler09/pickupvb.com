import { getServerSupabase } from '@/lib/supabase';
import { brandOgImage, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og-image';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Volleyball group on PickupVB';

export default async function Image({ params }: { params: { id: string } }) {
    const supabase = await getServerSupabase();
    const { data } = await supabase
        .from('groups')
        .select('name, home_city, region')
        .eq('id', params.id)
        .maybeSingle();
    const row = data as {
        name: string;
        home_city: string | null;
        region: string | null;
    } | null;
    const place = row ? [row.home_city, row.region].filter(Boolean).join(', ') : '';
    return brandOgImage({
        eyebrow: 'Volleyball group',
        title: row?.name ?? 'Group',
        meta: place || 'PickupVB',
    });
}
