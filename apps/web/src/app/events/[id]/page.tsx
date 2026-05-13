import Link from 'next/link';
import dynamicImport from 'next/dynamic';
import { notFound } from 'next/navigation';
import { GetEventByIdQuery } from '@pickupvb/application';
import { handlers } from '@/lib/handlers';
import { getServerSupabase } from '@/lib/supabase';
import { AttendeeList } from '@/components/attendee-list';

const EventMap = dynamicImport(() => import('@/components/event-map'), {
    ssr: false,
    loading: () => (
        <div className="h-[320px] w-full animate-pulse rounded-lg bg-fg/5" />
    ),
});

export const dynamic = 'force-dynamic';

const SURFACE_LABEL: Record<string, string> = {
    indoor: 'Indoor',
    grass: 'Grass',
    sand: 'Sand',
};
const FORMAT_LABEL: Record<string, string> = {
    sixes: 'Sixes',
    quads: 'Quads',
    triples: 'Triples',
    doubles: 'Doubles',
};
const GENDER_LABEL: Record<string, string> = {
    coed: 'Coed',
    mens: "Men's",
    womens: "Women's",
};
const SKILL_LABEL: Record<string, string> = {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
    competitive: 'Competitive',
};
const TYPE_LABEL: Record<string, string> = {
    open_play: 'Open play',
    tournament: 'Tournament',
};
const STATUS_LABEL: Record<string, string> = {
    draft: 'Draft',
    published: 'Published',
    cancelled: 'Cancelled',
    completed: 'Completed',
};

function formatDate(d: Date): string {
    return d.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

export default async function EventDetailPage({ params }: { params: { id: string } }) {
    let event;
    try {
        event = await handlers.getEventById.execute(new GetEventByIdQuery(params.id));
    } catch (err) {
        if (err instanceof Error && err.message === 'NOT_FOUND') notFound();
        throw err;
    }

    const supabase = getServerSupabase();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    const { data: attendeeRows } = await supabase
        .from('event_attendees')
        .select('user_id, joined_at, profiles:profiles!inner(display_name, first_name, last_name, avatar_url)')
        .eq('event_id', event.id)
        .order('joined_at', { ascending: true });

    type AttendeeRow = {
        user_id: string;
        joined_at: string;
        profiles: {
            display_name: string;
            first_name: string | null;
            last_name: string | null;
            avatar_url: string | null;
        } | null;
    };
    const attendees: AttendeeRow[] = (attendeeRows as AttendeeRow[] | null) ?? [];
    const isAttending = Boolean(user && attendees.some((a) => a.user_id === user.id));

    const startsAt = new Date(event.startsAt);
    const endsAt = new Date(event.endsAt);

    return (
        <article className="mx-auto max-w-3xl space-y-8">
            <Link href="/events" className="text-sm text-primary hover:underline">
                ← Back to events
            </Link>

            <header className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-primary/15 px-2 py-1 font-medium text-primary">
                        {TYPE_LABEL[event.type] ?? event.type}
                    </span>
                    <span className="rounded-full bg-fg/5 px-2 py-1 text-fg/80">
                        {SURFACE_LABEL[event.surface] ?? event.surface}
                    </span>
                    <span className="rounded-full bg-fg/5 px-2 py-1 text-fg/80">
                        {SKILL_LABEL[event.skillLevel] ?? event.skillLevel}
                    </span>
                    {event.format && (
                        <span className="rounded-full bg-fg/5 px-2 py-1 text-fg/80">
                            {FORMAT_LABEL[event.format] ?? event.format}
                        </span>
                    )}
                    {event.gender && (
                        <span className="rounded-full bg-fg/5 px-2 py-1 text-fg/80">
                            {GENDER_LABEL[event.gender] ?? event.gender}
                        </span>
                    )}
                    {event.status !== 'published' && (
                        <span className="rounded-full bg-highlight px-2 py-1 font-medium text-highlight-fg">
                            {STATUS_LABEL[event.status] ?? event.status}
                        </span>
                    )}
                </div>
                <h1 className="text-3xl font-bold text-fg">{event.title}</h1>
            </header>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-border-base p-4">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                        When
                    </h2>
                    <p className="mt-1 font-medium text-fg">{formatDate(startsAt)}</p>
                    <p className="text-sm text-muted">to {formatDate(endsAt)}</p>
                </div>
                <div className="rounded-lg border border-border-base p-4">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Spots
                    </h2>
                    {event.spotsRemaining === null ? (
                        <p className="mt-1 font-medium text-fg">Unlimited</p>
                    ) : (
                        <p className="mt-1 font-medium text-fg">
                            {event.spotsRemaining} open ·{' '}
                            <span className="text-muted">{event.attendeeCount} signed up</span>
                        </p>
                    )}
                </div>
            </section>

            <section className="space-y-2">
                <h2 className="text-lg font-semibold text-fg">Where</h2>
                <p className="text-fg/90">{event.location.addressLine}</p>
                <p className="text-sm text-muted">
                    {event.location.city}, {event.location.region} {event.location.postalCode}
                </p>
                <EventMap
                    latitude={event.location.latitude}
                    longitude={event.location.longitude}
                    title={event.title}
                    addressLine={event.location.addressLine}
                />
                <a
                    href={`https://www.openstreetmap.org/?mlat=${event.location.latitude}&mlon=${event.location.longitude}#map=16/${event.location.latitude}/${event.location.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary hover:underline"
                >
                    Open in map ↗
                </a>
            </section>

            {event.description && (
                <section>
                    <h2 className="mb-2 text-lg font-semibold text-fg">Description</h2>
                    <p className="whitespace-pre-wrap text-fg/90">{event.description}</p>
                </section>
            )}

            {event.rules && (
                <section>
                    <h2 className="mb-2 text-lg font-semibold text-fg">Rules</h2>
                    <p className="whitespace-pre-wrap text-fg/90">{event.rules}</p>
                </section>
            )}

            <section>
                <h2 className="mb-3 text-lg font-semibold text-fg">
                    Players signed up{' '}
                    <span className="text-sm font-normal text-muted">
                        ({attendees.length})
                    </span>
                </h2>
                <AttendeeList attendees={attendees} currentUserId={user?.id ?? null} />
            </section>

            <section className="rounded-lg border border-border-base p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Hosted on PickupVB
                </h2>
                <p className="mt-2 text-sm text-muted">
                    Event ID: <code className="rounded bg-fg/5 px-1 text-xs">{event.id}</code>
                </p>
            </section>

            {event.type === 'open_play' && event.status === 'published' && (
                <div className="flex justify-end">
                    {!user ? (
                        <Link
                            href={`/login?next=/events/${event.id}`}
                            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
                        >
                            Sign in to join
                        </Link>
                    ) : isAttending ? (
                        <span className="rounded-md border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
                            You&apos;re signed up
                        </span>
                    ) : (
                        <form action={`/api/events/${event.id}/join`} method="post">
                            <button
                                type="submit"
                                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
                            >
                                Join this event
                            </button>
                        </form>
                    )}
                </div>
            )}
        </article>
    );
}
