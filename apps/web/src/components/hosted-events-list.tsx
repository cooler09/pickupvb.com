import Link from 'next/link';
import type { ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { skillTierBand, type SkillTier } from '@pickupvb/domain';
import type { Database } from '@pickupvb/supabase';
import { SURFACE_LABEL, TYPE_LABEL, SKILL_LABEL } from '@/lib/enum-labels';
import { LocalDateTime } from '@/components/local-datetime';

/**
 * Supabase client shape accepted by the loaders below. Works with both
 * the cookie-bound server client (`getServerSupabase`) and the sessionless
 * anon client (`createSupabaseAnonClient`). The anon client returns only
 * publicly-visible events; the server client returns events visible to
 * the viewer per RLS.
 */
export type HostedEventsLoaderClient = SupabaseClient<Database>;

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
 * Batch-fetch the primary (sort_order=0) division for each event id and
 * fold its display fields (skill_level via tier→band map, capacity_kind,
 * max_spots) into the rows. Phase 9b of ADR 0006 routed these display
 * values off the legacy event columns onto event_divisions.
 */
export async function hydratePrimaryDivision(
  supabase: HostedEventsLoaderClient,
  rows: HostedEventRow[],
): Promise<HostedEventRow[]> {
  if (rows.length === 0) return rows;
  const { data: divRows } = await supabase
    .from('event_divisions')
    .select('event_id, sort_order, skill_tier, capacity_kind, max_spots')
    .in(
      'event_id',
      rows.map((r) => r.id),
    )
    .order('sort_order', { ascending: true });
  type DivRow = {
    event_id: string;
    sort_order: number;
    skill_tier: SkillTier;
    capacity_kind: 'fixed' | 'unlimited' | null;
    max_spots: number | null;
  };
  const byEvent = new Map<string, DivRow>();
  for (const d of (divRows as DivRow[] | null) ?? []) {
    if (!byEvent.has(d.event_id)) byEvent.set(d.event_id, d);
  }
  return rows.map((r) => {
    const d = byEvent.get(r.id);
    if (!d) return r;
    return {
      ...r,
      skill_level: skillTierBand(d.skill_tier),
      capacity_kind: d.capacity_kind,
      max_spots: d.max_spots,
    };
  });
}

/**
 * Loads events hosted by `hostId` (as primary user host or as a co-host) that
 * the **current viewer** is allowed to see. Visibility is enforced by RLS on
 * `events` via the `events_view` read model — we don't filter manually.
 *
 * Optional `startsAfter` / `startsBefore` push the upcoming/past split into
 * SQL so we don't pull the entire history just to drop half of it client-side.
 */
export async function loadVisibleHostedEvents(
  supabase: HostedEventsLoaderClient,
  hostId: string,
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

  // Primary host and co-host membership lookups are independent.
  const [primaryResult, coRowsResult] = await Promise.all([
    applyDateFilters(
      supabase
        .from('events_view')
        .select(
          'id, title, starts_at, time_zone, city, region, type, surface, status, attendee_count',
        )
        .eq('host_id', hostId),
    ).order('starts_at', { ascending: true }),
    supabase.from('event_co_hosts').select('event_id').eq('host_user_id', hostId),
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
        .select(
          'id, title, starts_at, time_zone, city, region, type, surface, status, attendee_count',
        )
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

export function HostedEventsList({
  events,
  emptyState,
}: {
  events: HostedEventRow[];
  emptyState: ReactNode;
}) {
  if (events.length === 0) {
    return (
      <p className="border-border-base text-muted rounded-shape-sm border border-dashed p-4 text-sm">
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
            className="border-border-base bg-md-surface-container hover:border-primary/40 rounded-shape-sm border p-3"
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
