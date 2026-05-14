import Link from 'next/link';
import type { ReactNode } from 'react';
import { getServerSupabase } from '@/lib/supabase';

const TYPE_LABEL: Record<string, string> = { open_play: 'Open play', tournament: 'Tournament' };
const SURFACE_LABEL: Record<string, string> = { indoor: 'Indoor', grass: 'Grass', sand: 'Sand' };
const SKILL_LABEL: Record<string, string> = {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
    competitive: 'Competitive',
};

type HostedEventRow = {
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

function formatStart(d: Date): string {
    return d.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

/**
 * Loads events hosted by `hostId` that the **current viewer** is allowed to see.
 * Visibility is enforced by the `events` table RLS policy via the `events_view`
 * read model — we don't filter manually, we just query and trust RLS.
 */
export async function loadVisibleHostedEvents(hostId: string): Promise<HostedEventRow[]> {
    const supabase = getServerSupabase();
    const { data } = await supabase
        .from('events_view')
        .select(
            'id, title, starts_at, city, region, type, surface, skill_level, status, capacity_kind, max_spots, attendee_count',
        )
        .eq('host_id', hostId)
        .order('starts_at', { ascending: true });
    return (data as HostedEventRow[] | null) ?? [];
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
                            {formatStart(new Date(e.starts_at))}
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
