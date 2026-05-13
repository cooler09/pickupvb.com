import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GetEventByIdQuery } from '@pickupvb/application';
import { handlers } from '@/lib/handlers';
import { getServerSupabase } from '@/lib/supabase';

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
    const isAttending = false; // TODO: wire from event.attendees once exposed in DTO

    const startsAt = new Date(event.startsAt);
    const endsAt = new Date(event.endsAt);

    return (
        <article className="mx-auto max-w-3xl space-y-8">
            <Link href="/events" className="text-sm text-court-600 hover:underline">
                ← Back to events
            </Link>

            <header className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-court-100 px-2 py-1 font-medium text-court-700">
                        {TYPE_LABEL[event.type] ?? event.type}
                    </span>
                    <span className="rounded-full bg-net-900/5 px-2 py-1 text-net-800/80">
                        {SURFACE_LABEL[event.surface] ?? event.surface}
                    </span>
                    <span className="rounded-full bg-net-900/5 px-2 py-1 text-net-800/80">
                        {SKILL_LABEL[event.skillLevel] ?? event.skillLevel}
                    </span>
                    {event.format && (
                        <span className="rounded-full bg-net-900/5 px-2 py-1 text-net-800/80">
                            {FORMAT_LABEL[event.format] ?? event.format}
                        </span>
                    )}
                    {event.gender && (
                        <span className="rounded-full bg-net-900/5 px-2 py-1 text-net-800/80">
                            {GENDER_LABEL[event.gender] ?? event.gender}
                        </span>
                    )}
                    {event.status !== 'published' && (
                        <span className="rounded-full bg-yellow-100 px-2 py-1 font-medium text-yellow-800">
                            {STATUS_LABEL[event.status] ?? event.status}
                        </span>
                    )}
                </div>
                <h1 className="text-3xl font-bold text-net-900">{event.title}</h1>
            </header>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-net-900/10 p-4">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-net-800/60">
                        When
                    </h2>
                    <p className="mt-1 font-medium text-net-900">{formatDate(startsAt)}</p>
                    <p className="text-sm text-net-800/70">to {formatDate(endsAt)}</p>
                </div>
                <div className="rounded-lg border border-net-900/10 p-4">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-net-800/60">
                        Spots
                    </h2>
                    {event.spotsRemaining === null ? (
                        <p className="mt-1 font-medium text-net-900">Unlimited</p>
                    ) : (
                        <p className="mt-1 font-medium text-net-900">
                            {event.spotsRemaining} open ·{' '}
                            <span className="text-net-800/70">{event.attendeeCount} signed up</span>
                        </p>
                    )}
                </div>
            </section>

            {event.description && (
                <section>
                    <h2 className="mb-2 text-lg font-semibold text-net-900">Description</h2>
                    <p className="whitespace-pre-wrap text-net-800/90">{event.description}</p>
                </section>
            )}

            {event.rules && (
                <section>
                    <h2 className="mb-2 text-lg font-semibold text-net-900">Rules</h2>
                    <p className="whitespace-pre-wrap text-net-800/90">{event.rules}</p>
                </section>
            )}

            <section className="rounded-lg border border-net-900/10 p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-net-800/60">
                    Hosted on PickupVB
                </h2>
                <p className="mt-2 text-sm text-net-800/70">
                    Event ID: <code className="rounded bg-net-900/5 px-1 text-xs">{event.id}</code>
                </p>
            </section>

            {event.type === 'open_play' && event.status === 'published' && (
                <div className="flex justify-end">
                    {!user ? (
                        <Link
                            href={`/login?next=/events/${event.id}`}
                            className="rounded-md bg-court-600 px-4 py-2 text-sm font-semibold text-white hover:bg-court-700"
                        >
                            Sign in to join
                        </Link>
                    ) : isAttending ? (
                        <span className="rounded-md border border-court-200 bg-court-50 px-4 py-2 text-sm font-medium text-court-700">
                            You&apos;re signed up
                        </span>
                    ) : (
                        <form action={`/api/events/${event.id}/join`} method="post">
                            <button
                                type="submit"
                                className="rounded-md bg-court-600 px-4 py-2 text-sm font-semibold text-white hover:bg-court-700"
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
