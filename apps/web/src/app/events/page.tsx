import Link from 'next/link';
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

    const filters: Parameters<typeof handlers.searchEvents.execute>[0]['filters'] = {
        limit: 30,
        ...(lat !== null && lng !== null
            ? { near: { latitude: lat, longitude: lng, radiusKm } }
            : {}),
        ...(surface ? { surface } : {}),
        ...(type ? { type } : {}),
        ...(skillLevel ? { skillLevel } : {}),
    };

    const events = await handlers.searchEvents.execute(
        new SearchEventsQuery(user?.id ?? null, filters),
    );

    const hasLocation = lat !== null && lng !== null;

    return (
        <section className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold">Find events</h1>
                {user && (
                    <Link
                        href="/events/new"
                        className="rounded-md bg-court-600 px-4 py-2 font-medium text-white hover:bg-court-700"
                    >
                        Host an event
                    </Link>
                )}
            </div>

            {!user && (
                <p className="rounded-md bg-sand-50 p-4 text-sm">
                    <Link href="/login" className="font-semibold text-court-600 hover:underline">
                        Sign in
                    </Link>{' '}
                    to RSVP and host events.
                </p>
            )}

            <form
                method="get"
                className="grid gap-3 rounded-lg border border-net-900/10 bg-white p-4 sm:grid-cols-[1fr_1fr_1fr_auto]"
            >
                <label className="text-sm">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-net-800/60">
                        Surface
                    </span>
                    <select
                        name="surface"
                        defaultValue={surface ?? ''}
                        className="mt-1 w-full rounded-md border border-net-900/15 px-2 py-1.5"
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
                    <span className="block text-xs font-semibold uppercase tracking-wide text-net-800/60">
                        Type
                    </span>
                    <select
                        name="type"
                        defaultValue={type ?? ''}
                        className="mt-1 w-full rounded-md border border-net-900/15 px-2 py-1.5"
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
                    <span className="block text-xs font-semibold uppercase tracking-wide text-net-800/60">
                        Skill
                    </span>
                    <select
                        name="skill"
                        defaultValue={skillLevel ?? ''}
                        className="mt-1 w-full rounded-md border border-net-900/15 px-2 py-1.5"
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
                        className="h-[34px] rounded-md bg-court-600 px-4 text-sm font-semibold text-white hover:bg-court-700"
                    >
                        Apply
                    </button>
                </div>
                {hasLocation && (
                    <>
                        <input type="hidden" name="lat" value={String(lat)} />
                        <input type="hidden" name="lng" value={String(lng)} />
                        <label className="text-sm sm:col-span-2">
                            <span className="block text-xs font-semibold uppercase tracking-wide text-net-800/60">
                                Radius (km)
                            </span>
                            <input
                                name="radiusKm"
                                type="number"
                                min={1}
                                max={500}
                                defaultValue={radiusKm}
                                className="mt-1 w-full rounded-md border border-net-900/15 px-2 py-1.5"
                            />
                        </label>
                    </>
                )}
            </form>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <NearMeButton />
                {hasLocation && (
                    <Link href="/events" className="text-sm text-court-600 hover:underline">
                        Clear location
                    </Link>
                )}
            </div>

            {hasLocation && (
                <p className="text-sm text-net-800/70">
                    Showing events within {radiusKm} km of your location.
                </p>
            )}

            {events.length === 0 ? (
                <p className="rounded-md bg-sand-50 p-6 text-center text-net-800/70">
                    No events match your filters yet.
                </p>
            ) : (
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {events.map((e) => (
                        <li
                            key={e.id}
                            className="rounded-lg border border-net-900/10 bg-white p-4 hover:border-court-300"
                        >
                            <Link
                                href={`/events/${e.id}`}
                                className="block font-semibold hover:text-court-600"
                            >
                                {e.title}
                            </Link>
                            <p className="mt-1 text-xs text-net-800/60">
                                {formatStart(new Date(e.startsAt))}
                            </p>
                            <p className="mt-1 text-sm text-net-800/80">
                                {e.city}, {e.region}
                                {e.distanceKm !== null && (
                                    <span className="text-net-800/60">
                                        {' '}
                                        · {e.distanceKm.toFixed(1)} km
                                    </span>
                                )}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                                <span className="rounded bg-court-100 px-1.5 py-0.5 text-court-700">
                                    {TYPE_LABEL[e.type] ?? e.type}
                                </span>
                                <span className="rounded bg-net-900/5 px-1.5 py-0.5">
                                    {SURFACE_LABEL[e.surface] ?? e.surface}
                                </span>
                                <span className="rounded bg-net-900/5 px-1.5 py-0.5">
                                    {SKILL_LABEL[e.skillLevel] ?? e.skillLevel}
                                </span>
                            </div>
                            {e.spotsRemaining !== null && (
                                <p className="mt-2 text-xs text-net-800/70">
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
