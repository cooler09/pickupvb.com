import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  type HostedEventRow,
  type HostedEventsLoaderClient,
  hydratePrimaryDivision,
} from './hosted-events-list';
import { HostedEventsList } from './hosted-events-list';

/**
 * Loads events hosted by `groupId` (primary host or co-host). Visibility
 * is enforced by RLS on `events` via the `events_view` read model; pass a
 * cookie-bound server client for per-viewer visibility, or the anon
 * client for the public set (used by ISR-cacheable shells).
 *
 * Optional `startsAfter` / `startsBefore` push the upcoming/past split into
 * SQL so we don't pull the entire history just to drop half of it client-side.
 */
export async function loadVisibleGroupHostedEvents(
  supabase: HostedEventsLoaderClient,
  groupId: string,
  opts: { startsAfter?: Date; startsBefore?: Date } = {},
): Promise<HostedEventRow[]> {
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

  // Primary group host and co-host membership lookups are independent.
  const [primaryResult, coRowsResult] = await Promise.all([
    applyDateFilters(
      supabase
        .from('events_view')
        .select('id, title, starts_at, city, region, type, surface, status, attendee_count')
        .eq('host_group_id', groupId),
    ).order('starts_at', { ascending: true }),
    supabase.from('event_co_hosts').select('event_id').eq('host_group_id', groupId),
  ]);
  type ViewRow = Omit<HostedEventRow, 'skill_level' | 'capacity_kind' | 'max_spots'>;
  const primary: HostedEventRow[] = ((primaryResult.data as ViewRow[] | null) ?? []).map((r) => ({
    ...r,
    skill_level: '',
    capacity_kind: null,
    max_spots: null,
  }));
  const coIds = ((coRowsResult.data as { event_id: string }[] | null) ?? []).map((r) => r.event_id);

  let coEvents: HostedEventRow[] = [];
  if (coIds.length > 0) {
    const { data: coData } = await applyDateFilters(
      supabase
        .from('events_view')
        .select('id, title, starts_at, city, region, type, surface, status, attendee_count')
        .in('id', coIds),
    ).order('starts_at', { ascending: true });
    coEvents = ((coData as ViewRow[] | null) ?? []).map((r) => ({
      ...r,
      skill_level: '',
      capacity_kind: null,
      max_spots: null,
    }));
  }

  const merged = new Map<string, HostedEventRow>();
  for (const e of primary) merged.set(e.id, e);
  for (const e of coEvents) merged.set(e.id, e);
  const all = Array.from(merged.values()).sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );
  return hydratePrimaryDivision(supabase, all);
}

export function GroupHostedEventsList(props: { events: HostedEventRow[]; emptyState: ReactNode }) {
  return <HostedEventsList {...props} />;
}

export { HostedEventsList } from './hosted-events-list';
