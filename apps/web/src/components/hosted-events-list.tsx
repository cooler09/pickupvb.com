import Link from 'next/link';
import type { ReactNode } from 'react';
import { getServerSupabase } from '@/lib/supabase';
import { SURFACE_LABEL, TYPE_LABEL, SKILL_LABEL } from '@/lib/enum-labels';
import { formatEventStart } from '@/lib/date-formats';

export type HostedEventRow = {
    id: string;
    title: string;
    starts_at: string;
    city: string;
    region: string;
    type: string;
    surface: string;
    skill_level: string;
    status: string;
    capacity_kind: string | null;
    max_spots: number | null;
    attendee_count: number;
};

/**
 * Loads events hosted by `hostId` (as primary user host or as a co-host) that
 * the **current viewer** is allowed to see. Visibility is enforced by RLS on
 * `events` via the `events_view` read model — we don't filter manually.
 */
export async function loadVisibleHostedEvents(hostId: string): Promise<HostedEventRow[]> {
    const supabase = await getServerSupabase();

    const { data: primary } = await supabase
        .from('events_view')
        .select(
            'id, title, starts_at, city, region, type, surface, skill_level, status, capacity_kind, max_spots, attendee_count',
        )
        .eq('host_id', hostId)
        .order('starts_at', { ascending: true });

    const { data: coRows } = await supabase
        .from('event_co_hosts')
        .select('event_id')
        .eq('host_user_id', hostId);
    const coIds = ((coRows as { event_id: string }[] | null) ?? []).map((r) => r.event_id);

    let coEvents: HostedEventRow[] = [];
    if (coIds.length > 0) {
        const { data: coData } = await supabase
            .from('events_view')
            .select(
                'id, title, starts_at, city, region, type, surface, skill_level, status, capacity_kind, max_spots, attendee_count',
            )
            .in('id', coIds)
            .order('starts_at', { ascending: true });
        coEvents = (coData as HostedEventRow[] | null) ?? [];
    }

    const merged = new Map<string, HostedEventRow>();
    for (const e of (primary as HostedEventRow[] | null) ?? []) merged.set(e.id, e);
    for (const e of coEvents) merged.set(e.id, e);
    return Array.from(merged.values()).sort(
        (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    );
}

export function HostedEventsList({
    events,
    emptyState,
}: {
    events: HostedEventRow[];
    emptyState: ReactNode;
}) {
    if (events.length === 0) {
        return (
            <p className="rounded-lg border border-dashed border-border-base p-4 text-sm text-muted">
                {emptyState}
            </p>
        );
    }

    return (
        <ul className="grid gap-3 sm:grid-cols-2">
            {events.map((e) => {
                const spotsRemaining =
                    e.capacity_kind === 'fixed' && e.max_spots !== null
                        ? Math.max(0, e.max_spots - e.attendee_count)
                        : null;
                return (
                    <li
                        key={e.id}
                        className="rounded-lg border border-border-base bg-surface p-3 hover:border-primary/40"
                    >
                        <Link
                            href={`/events/${e.id}`}
                            className="block text-sm font-semibold hover:text-primary"
                        >
                            {e.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted">
                            {formatEventStart(new Date(e.starts_at))}
                        </p>
                        <p className="mt-0.5 text-xs text-fg/80">
                            {e.city}, {e.region}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
                            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-primary">
                                {TYPE_LABEL[e.type] ?? e.type}
                            </span>
                            <span className="rounded bg-fg/5 px-1.5 py-0.5">
                                {SURFACE_LABEL[e.surface] ?? e.surface}
                            </span>
                            <span className="rounded bg-fg/5 px-1.5 py-0.5">
                                {SKILL_LABEL[e.skill_level] ?? e.skill_level}
                            </span>
                            {e.status !== 'published' && (
                                <span className="rounded bg-highlight px-1.5 py-0.5 text-highlight-fg">
                                    {e.status}
                                </span>
                            )}
                        </div>
                        {spotsRemaining !== null && (
                            <p className="mt-1 text-[11px] text-muted">
                                {spotsRemaining} spots open · {e.attendee_count} signed up
                            </p>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}
