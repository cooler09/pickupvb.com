import { getServerSupabase } from '@/lib/supabase';
import { FORMAT_LABEL } from '@/lib/enum-labels';
import { brandOgImage, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og-image';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Volleyball team on PickupVB';

export default async function Image({ params }: { params: { id: string } }) {
    const supabase = await getServerSupabase();
    const { data } = await supabase
        .from('teams')
        .select('name, format')
        .eq('id', params.id)
        .maybeSingle();
    const row = data as { name: string; format: string } | null;
    const formatLabel = row
        ? FORMAT_LABEL[row.format as keyof typeof FORMAT_LABEL] ?? row.format
        : '';
    return brandOgImage({
        eyebrow: 'Tournament team',
        title: row?.name ?? 'Team',
        meta: formatLabel ? `${formatLabel} volleyball` : 'PickupVB',
    });
}
