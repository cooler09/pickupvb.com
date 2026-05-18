import Link from 'next/link';
import type { ReactNode } from 'react';
import { getServerSupabase } from '@/lib/supabase';
import { SURFACE_LABEL, TYPE_LABEL, SKILL_LABEL } from '@/lib/enum-labels';
import { LocalDateTime } from '@/components/local-datetime';

export type HostedEventRow = {
  id: string;
  title: string;
  starts_at: string;
  time_zone: string | null;
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
 *
 * Optional `startsAfter` / `startsBefore` push the upcoming/past split into
 * SQL so we don't pull the entire history just to drop half of it client-side.
 */
export async function loadVisibleHostedEvents(
  hostId: string,
  opts: { startsAfter?: Date; startsBefore?: Date } = {},
): Promise<HostedEventRow[]> {
  const supabase = await getServerSupabase();

  const applyDateFilters = <
    T extends {
      gte: (col: string, val: string) => T;
      lt: (col: string, val: string) => T;
    },
  >(
    q: T,
  ): T => {
    let out = q;
    if (opts.startsAfter) out = out.gte('starts_at', opts.startsAfter.toISOString());
    if (opts.startsBefore) out = out.lt('starts_at', opts.startsBefore.toISOString());
    return out;
  };

  // Primary host and co-host membership lookups are independent.
  const [primaryResult, coRowsResult] = await Promise.all([
    applyDateFilters(
      supabase
        .from('events_view')
        .select(
          'id, title, starts_at, time_zone, city, region, type, surface, skill_level, status, capacity_kind, max_spots, attendee_count',
        )
        .eq('host_id', hostId),
    ).order('starts_at', { ascending: true }),
    supabase.from('event_co_hosts').select('event_id').eq('host_user_id', hostId),
  ]);
  const primary = primaryResult.data;
  const coIds = ((coRowsResult.data as { event_id: string }[] | null) ?? []).map((r) => r.event_id);

  let coEvents: HostedEventRow[] = [];
  if (coIds.length > 0) {
    const { data: coData } = await applyDateFilters(
      supabase
        .from('events_view')
        .select(
          'id, title, starts_at, time_zone, city, region, type, surface, skill_level, status, capacity_kind, max_spots, attendee_count',
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

export function HostedEventsList({
  events,
  emptyState,
}: {
  events: HostedEventRow[];
  emptyState: ReactNode;
}) {
  if (events.length === 0) {
    return (
      <p className="border-border-base text-muted rounded-lg border border-dashed p-4 text-sm">
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
            className="border-border-base bg-surface hover:border-primary/40 rounded-lg border p-3"
          >
            <Link
              href={`/events/${e.id}`}
              className="hover:text-primary block text-sm font-semibold"
            >
              {e.title}
            </Link>
            <p className="text-muted mt-0.5 text-xs">
              <LocalDateTime iso={e.starts_at} variant="eventStart" timeZone={e.time_zone} />
            </p>
            <p className="text-fg/80 mt-0.5 text-xs">
              {e.city}, {e.region}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
              <span className="bg-primary/15 text-primary rounded px-1.5 py-0.5">
                {TYPE_LABEL[e.type] ?? e.type}
              </span>
              <span className="bg-fg/5 rounded px-1.5 py-0.5">
                {SURFACE_LABEL[e.surface] ?? e.surface}
              </span>
              <span className="bg-fg/5 rounded px-1.5 py-0.5">
                {SKILL_LABEL[e.skill_level] ?? e.skill_level}
              </span>
              {e.status !== 'published' && (
                <span className="bg-highlight text-highlight-fg rounded px-1.5 py-0.5">
                  {e.status}
                </span>
              )}
            </div>
            {spotsRemaining !== null && (
              <p className="text-muted mt-1 text-[11px]">
                {spotsRemaining} spots open · {e.attendee_count} signed up
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
