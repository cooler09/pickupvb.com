import Link from 'next/link';
import type { Route } from 'next';
import { SearchEventsQuery } from '@pickupvb/application';
import { handlers } from '@/lib/handlers';
import { getServerSupabase } from '@/lib/supabase';
import { NearMeButton } from './near-me-button';

export const dynamic = 'force-dynamic';

const SURFACES = ['indoor', 'grass', 'sand'] as const;
const TYPES = ['open_play', 'tournament'] as const;
const SKILLS = ['beginner', 'intermediate', 'advanced', 'competitive'] as const;

const SURFACE_LABEL: Record<string, string> = { indoor: 'Indoor', grass: 'Grass', sand: 'Sand' };
const TYPE_LABEL: Record<string, string> = { open_play: 'Open play', tournament: 'Tournament' };
const SKILL_LABEL: Record<string, string> = {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
    competitive: 'Competitive',
};

function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
    return allowed.includes(value as T) ? (value as T) : undefined;
}

function parseFloatOrNull(value: string | undefined): number | null {
    if (!value) return null;
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
}

function formatStart(d: Date): string {
    return d.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

export default async function EventsPage({
    searchParams,
}: {
    searchParams: Record<string, string | string[] | undefined>;
}) {
    const supabase = getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const get = (k: string): string | undefined => {
        const v = searchParams[k];
        return Array.isArray(v) ? v[0] : v;
    };

    const lat = parseFloatOrNull(get('lat'));
    const lng = parseFloatOrNull(get('lng'));
    const radiusKm = parseFloatOrNull(get('radiusKm')) ?? 40;
    const surface = pick(get('surface'), SURFACES);
    const type = pick(get('type'), TYPES);
    const skillLevel = pick(get('skill'), SKILLS);

    // Pre-fetch friend ids + names so we can (a) auto-default to the Following
    // tab for users with an established network and (b) render the small
    // "Hosted by X / Y is going" badge on Following cards.
    let friendIds: string[] = [];
    const friendNameById = new Map<string, string>();
    if (user) {
        const { data: fRows } = await supabase
            .from('friendships')
            .select('friend_id')
            .eq('user_id', user.id);
        friendIds = ((fRows ?? []) as { friend_id: string }[]).map((r) => r.friend_id);
        if (friendIds.length > 0) {
            const { data: pRows } = await supabase
                .from('profiles')
                .select('id, display_name, first_name, last_name')
                .in('id', friendIds);
            type ProfileRow = {
                id: string;
                display_name: string;
                first_name: string | null;
                last_name: string | null;
            };
            for (const p of (pRows ?? []) as ProfileRow[]) {
                const full = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
                friendNameById.set(p.id, full || p.display_name || 'Player');
            }
        }
    }

    // If the viewer follows enough people, default to the Following tab.
    const FOLLOWING_DEFAULT_THRESHOLD = 3;
    const explicitWhen = get('when');
    const when: 'upcoming' | 'past' | 'following' =
        explicitWhen === 'past'
            ? 'past'
            : explicitWhen === 'following'
                ? 'following'
                : explicitWhen === 'upcoming'
                    ? 'upcoming'
                    : user && friendIds.length >= FOLLOWING_DEFAULT_THRESHOLD
                        ? 'following'
                        : 'upcoming';

    const now = new Date();

    type EventCard = {
        id: string;
        title: string;
        surface: string;
        skillLevel: string;
        type: string;
        startsAt: Date;
        city: string;
        region: string;
        spotsRemaining: number | null;
        distanceKm: number | null;
        // Following-tab metadata (undefined on other tabs):
        hostFriendId?: string;
        attendingFriendIds?: string[];
    };

    let events: EventCard[] = [];
    let followingEmptyReason: 'not_signed_in' | 'no_follows' | null = null;

    if (when === 'following') {
        if (!user) {
            followingEmptyReason = 'not_signed_in';
        } else if (friendIds.length === 0) {
            followingEmptyReason = 'no_follows';
        } else {
            const { data: aRows } = await supabase
                .from('event_attendees')
                .select('event_id, user_id')
                .in('user_id', friendIds);
            type AttRow = { event_id: string; user_id: string };
            const attRows = (aRows ?? []) as AttRow[];
            const attendingByEvent = new Map<string, string[]>();
            for (const r of attRows) {
                const arr = attendingByEvent.get(r.event_id) ?? [];
                arr.push(r.user_id);
                attendingByEvent.set(r.event_id, arr);
            }
            const attendeeEventIds = Array.from(attendingByEvent.keys());

            let q = supabase
                .from('events')
                .select(
                    'id, title, surface, skill_level, type, starts_at, city, region, host_id',
                )
                .gte('starts_at', now.toISOString())
                .order('starts_at', { ascending: true })
                .limit(60);
            if (surface) q = q.eq('surface', surface);
            if (type) q = q.eq('type', type);
            if (skillLevel) q = q.eq('skill_level', skillLevel);
            const orParts = [`host_id.in.(${friendIds.join(',')})`];
            if (attendeeEventIds.length > 0) {
                orParts.push(`id.in.(${attendeeEventIds.join(',')})`);
            }
            q = q.or(orParts.join(','));
            const { data: rows } = await q;
            type EvRow = {
                id: string;
                title: string;
                surface: string;
                skill_level: string;
                type: string;
                starts_at: string;
                city: string;
                region: string;
                host_id: string;
            };
            const friendIdSet = new Set(friendIds);
            events = ((rows ?? []) as EvRow[]).map((r) => {
                const hostFriendId = friendIdSet.has(r.host_id) ? r.host_id : undefined;
                const attendingFriendIds = (attendingByEvent.get(r.id) ?? []).filter(
                    (id) => id !== r.host_id,
                );
                return {
                    id: r.id,
                    title: r.title,
                    surface: r.surface,
                    skillLevel: r.skill_level,
                    type: r.type,
                    startsAt: new Date(r.starts_at),
                    city: r.city,
                    region: r.region,
                    spotsRemaining: null,
                    distanceKm: null,
                    ...(hostFriendId ? { hostFriendId } : {}),
                    ...(attendingFriendIds.length > 0 ? { attendingFriendIds } : {}),
                };
            });
        }
    } else {
        const filters: Parameters<typeof handlers.searchEvents.execute>[0]['filters'] = {
            limit: 30,
            ...(when === 'upcoming' ? { startsAfter: now } : { startsBefore: now }),
            ...(lat !== null && lng !== null
                ? { near: { latitude: lat, longitude: lng, radiusKm } }
                : {}),
            ...(surface ? { surface } : {}),
            ...(type ? { type } : {}),
            ...(skillLevel ? { skillLevel } : {}),
        };

        const rawEvents = await handlers.searchEvents.execute(
            new SearchEventsQuery(user?.id ?? null, filters),
        );
        // RPC returns ascending. For past events, show newest first.
        events =
            when === 'past'
                ? [...rawEvents].sort(
                    (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
                )
                : rawEvents;
    }

    const hasLocation = lat !== null && lng !== null;

    // Build a query string that preserves filters across tab switches.
    const tabQuery = (target: 'upcoming' | 'past' | 'following'): Route => {
        const params = new URLSearchParams();
        if (target !== 'upcoming') params.set('when', target);
        if (surface) params.set('surface', surface);
        if (type) params.set('type', type);
        if (skillLevel) params.set('skill', skillLevel);
        if (hasLocation && target !== 'following') {
            params.set('lat', String(lat));
            params.set('lng', String(lng));
            params.set('radiusKm', String(radiusKm));
        }
        const q = params.toString();
        return (q ? `/events?${q}` : '/events') as Route;
    };

    return (
        <section className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold">Find events</h1>
                {user && (
                    <Link
                        href="/events/new"
                        className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-primary/90"
                    >
                        Host an event
                    </Link>
                )}
            </div>

            {!user && (
                <p className="rounded-md bg-highlight/30 p-4 text-sm">
                    <Link href="/login" className="font-semibold text-primary hover:underline">
                        Sign in
                    </Link>{' '}
                    to RSVP and host events.
                </p>
            )}

            <div
                role="tablist"
                aria-label="Event timeframe"
                className="inline-flex rounded-md border border-border-base bg-surface p-0.5 text-sm"
            >
                <Link
                    href={tabQuery('upcoming')}
                    role="tab"
                    aria-selected={when === 'upcoming'}
                    className={`rounded px-3 py-1.5 font-medium transition ${when === 'upcoming'
                        ? 'bg-primary text-white'
                        : 'text-fg/70 hover:bg-fg/5'
                        }`}
                >
                    Upcoming
                </Link>
                {user && (
                    <Link
                        href={tabQuery('following')}
                        role="tab"
                        aria-selected={when === 'following'}
                        className={`rounded px-3 py-1.5 font-medium transition ${when === 'following'
                            ? 'bg-primary text-white'
                            : 'text-fg/70 hover:bg-fg/5'
                            }`}
                    >
                        Following
                        {friendIds.length > 0 && (
                            <span
                                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${when === 'following'
                                    ? 'bg-white/20 text-white'
                                    : 'bg-primary/15 text-primary'
                                    }`}
                            >
                                {friendIds.length}
                            </span>
                        )}
                    </Link>
                )}
                <Link
                    href={tabQuery('past')}
                    role="tab"
                    aria-selected={when === 'past'}
                    className={`rounded px-3 py-1.5 font-medium transition ${when === 'past'
                        ? 'bg-primary text-white'
                        : 'text-fg/70 hover:bg-fg/5'
                        }`}
                >
                    Past
                </Link>
            </div>

            <form
                method="get"
                className="grid gap-3 rounded-lg border border-border-base bg-surface p-4 sm:grid-cols-[1fr_1fr_1fr_auto]"
            >
                {when === 'past' && <input type="hidden" name="when" value="past" />}
                {when === 'following' && <input type="hidden" name="when" value="following" />}
                <label className="text-sm">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-muted">
                        Surface
                    </span>
                    <select
                        name="surface"
                        defaultValue={surface ?? ''}
                        className="mt-1 w-full rounded-md border border-border-base px-2 py-1.5"
                    >
                        <option value="">Any</option>
                        {SURFACES.map((s) => (
                            <option key={s} value={s}>
                                {SURFACE_LABEL[s]}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-sm">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-muted">
                        Type
                    </span>
                    <select
                        name="type"
                        defaultValue={type ?? ''}
                        className="mt-1 w-full rounded-md border border-border-base px-2 py-1.5"
                    >
                        <option value="">Any</option>
                        {TYPES.map((t) => (
                            <option key={t} value={t}>
                                {TYPE_LABEL[t]}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-sm">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-muted">
                        Skill
                    </span>
                    <select
                        name="skill"
                        defaultValue={skillLevel ?? ''}
                        className="mt-1 w-full rounded-md border border-border-base px-2 py-1.5"
                    >
                        <option value="">Any</option>
                        {SKILLS.map((s) => (
                            <option key={s} value={s}>
                                {SKILL_LABEL[s]}
                            </option>
                        ))}
                    </select>
                </label>
                <div className="flex items-end">
                    <button
                        type="submit"
                        className="h-[34px] rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90"
                    >
                        Apply
                    </button>
                </div>
                {hasLocation && (
                    <>
                        <input type="hidden" name="lat" value={String(lat)} />
                        <input type="hidden" name="lng" value={String(lng)} />
                        <label className="text-sm sm:col-span-2">
                            <span className="block text-xs font-semibold uppercase tracking-wide text-muted">
                                Radius (km)
                            </span>
                            <input
                                name="radiusKm"
                                type="number"
                                min={1}
                                max={500}
                                defaultValue={radiusKm}
                                className="mt-1 w-full rounded-md border border-border-base px-2 py-1.5"
                            />
                        </label>
                    </>
                )}
            </form>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <NearMeButton />
                {hasLocation && (
                    <Link href="/events" className="text-sm text-primary hover:underline">
                        Clear location
                    </Link>
                )}
            </div>

            {hasLocation && (
                <p className="text-sm text-muted">
                    Showing events within {radiusKm} km of your location.
                </p>
            )}

            {events.length === 0 ? (
                <p className="rounded-md bg-highlight/30 p-6 text-center text-muted">
                    {when === 'past'
                        ? 'No past events match your filters.'
                        : when === 'following'
                            ? followingEmptyReason === 'not_signed_in'
                                ? 'Sign in to see events from people you follow.'
                                : followingEmptyReason === 'no_follows'
                                    ? "You're not following anyone yet. Follow players from any event page to see their upcoming events here."
                                    : "No upcoming events from people you follow match your filters."
                            : 'No upcoming events match your filters yet.'}
                </p>
            ) : (
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {events.map((e) => (
                        <li
                            key={e.id}
                            className="rounded-lg border border-border-base bg-surface p-4 hover:border-primary/40"
                        >
                            <Link
                                href={`/events/${e.id}`}
                                className="block font-semibold hover:text-primary"
                            >
                                {e.title}
                            </Link>
                            <p className="mt-1 text-xs text-muted">
                                {formatStart(new Date(e.startsAt))}
                            </p>
                            <p className="mt-1 text-sm text-fg/80">
                                {e.city}, {e.region}
                                {e.distanceKm !== null && (
                                    <span className="text-muted">
                                        {' '}
                                        · {e.distanceKm.toFixed(1)} km
                                    </span>
                                )}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                                <span className="rounded bg-primary/15 px-1.5 py-0.5 text-primary">
                                    {TYPE_LABEL[e.type] ?? e.type}
                                </span>
                                <span className="rounded bg-fg/5 px-1.5 py-0.5">
                                    {SURFACE_LABEL[e.surface] ?? e.surface}
                                </span>
                                <span className="rounded bg-fg/5 px-1.5 py-0.5">
                                    {SKILL_LABEL[e.skillLevel] ?? e.skillLevel}
                                </span>
                            </div>
                            {when === 'following' && (() => {
                                const hostName = e.hostFriendId
                                    ? friendNameById.get(e.hostFriendId)
                                    : undefined;
                                const goingNames = (e.attendingFriendIds ?? [])
                                    .map((id) => friendNameById.get(id))
                                    .filter((n): n is string => Boolean(n));
                                let label: string | null = null;
                                if (hostName) {
                                    label = `Hosted by ${hostName}`;
                                } else if (goingNames.length === 1) {
                                    label = `${goingNames[0]} is going`;
                                } else if (goingNames.length === 2) {
                                    label = `${goingNames[0]} and ${goingNames[1]} are going`;
                                } else if (goingNames.length > 2) {
                                    label = `${goingNames[0]} and ${goingNames.length - 1} others going`;
                                }
                                return label ? (
                                    <p className="mt-2 text-[11px] font-medium text-primary">
                                        {label}
                                    </p>
                                ) : null;
                            })()}
                            {e.spotsRemaining !== null && (
                                <p className="mt-2 text-xs text-muted">
                                    {e.spotsRemaining} spots open
                                </p>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
