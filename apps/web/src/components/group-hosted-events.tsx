import Link from 'next/link';
import type { ReactNode } from 'react';
import { getServerSupabase } from '@/lib/supabase';
import { type HostedEventRow } from './hosted-events-list';
import { HostedEventsList } from './hosted-events-list';

/**
 * Loads events hosted by `groupId` (primary host or co-host) that the
 * **current viewer** is allowed to see. RLS on `events` filters automatically.
 *
 * Optional `startsAfter` / `startsBefore` push the upcoming/past split into
 * SQL so we don't pull the entire history just to drop half of it client-side.
 */
export async function loadVisibleGroupHostedEvents(
    groupId: string,
    opts: { startsAfter?: Date; startsBefore?: Date } = {},
): Promise<HostedEventRow[]> {
    const supabase = await getServerSupabase();

    const applyDateFilters = <T extends {
        gte: (col: string, val: string) => T;
        lt: (col: string, val: string) => T;
    }>(q: T): T => {
        let out = q;
        if (opts.startsAfter) out = out.gte('starts_at', opts.startsAfter.toISOString());
        if (opts.startsBefore) out = out.lt('starts_at', opts.startsBefore.toISOString());
        return out;
    };

    // Primary group host and co-host membership lookups are independent.
    const [primaryResult, coRowsResult] = await Promise.all([
        applyDateFilters(
            supabase
                .from('events_view')
                .select(
                    'id, title, starts_at, city, region, type, surface, skill_level, status, capacity_kind, max_spots, attendee_count',
                )
                .eq('host_group_id', groupId),
        ).order('starts_at', { ascending: true }),
        supabase.from('event_co_hosts').select('event_id').eq('host_group_id', groupId),
    ]);
    const primary = primaryResult.data;
    const coIds = ((coRowsResult.data as { event_id: string }[] | null) ?? []).map(
        (r) => r.event_id,
    );

    let coEvents: HostedEventRow[] = [];
    if (coIds.length > 0) {
        const { data: coData } = await applyDateFilters(
            supabase
                .from('events_view')
                .select(
                    'id, title, starts_at, city, region, type, surface, skill_level, status, capacity_kind, max_spots, attendee_count',
                )
                .in('id', coIds),
        ).order('starts_at', { ascending: true });
        coEvents = (coData as HostedEventRow[] | null) ?? [];
    }

    const merged = new Map<string, HostedEventRow>();
    for (const e of (primary as HostedEventRow[] | null) ?? []) merged.set(e.id, e);
    for (const e of coEvents) merged.set(e.id, e);
    return Array.from(merged.values()).sort(
        (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    );
}

export function GroupHostedEventsList(props: { events: HostedEventRow[]; emptyState: ReactNode }) {
    return <HostedEventsList {...props} />;
}

export { HostedEventsList } from './hosted-events-list';
