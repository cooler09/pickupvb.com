import Link from 'next/link';
import type { Route } from 'next';
import dynamicImport from 'next/dynamic';
import { notFound } from 'next/navigation';
import { GetEventDetailQuery } from '@pickupvb/application';
import { NotFoundError } from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { getViewer, isAnonymousUser } from '@/lib/server-auth';
import { formatEventDateLong } from '@/lib/date-formats';
import { AttendeeList } from '@/components/attendee-list';
import { EventTags } from './_components/event-tags';
import { EventShareLink } from './_components/event-share-link';
import { HostsSection } from './_components/hosts-section';
import { RsvpPanel } from './_components/rsvp-panel';
import { TournamentSignupPanel } from './_components/tournament-signup-panel';
import { FreeAgentSignupPanel } from './_components/free-agent-signup-panel';

const EventMap = dynamicImport(() => import('@/components/event-map'), {
    ssr: false,
    loading: () => (
        <div className="h-[320px] w-full animate-pulse rounded-lg bg-fg/5" />
    ),
});

export const dynamic = 'force-dynamic';

function pickQuery(
    searchParams: Record<string, string | string[] | undefined> | undefined,
    key: string,
): string | undefined {
    const v = searchParams?.[key];
    return Array.isArray(v) ? v[0] : v;
}

export default async function EventDetailPage({
    params,
    searchParams,
}: {
    params: { id: string };
    searchParams?: Record<string, string | string[] | undefined>;
}) {
    // Resolve the viewer first so the detail query can return viewer-specific
    // bits (RSVP state, manage permission, friend ids, hostable groups).
    const viewer = await getViewer();
    const user = viewer?.user ?? null;
    const isRealUser = !!user && !isAnonymousUser(user);

    let event;
    try {
        event = await handlers.getEventDetail.execute(
            new GetEventDetailQuery(params.id, user?.id ?? null),
        );
    } catch (err) {
        if (err instanceof NotFoundError) notFound();
        throw err;
    }

    const friendIds = new Set(event.viewerFriendIds);
    const returnPath = `/events/${event.id}`;
    const hasStarted = event.startsAt.getTime() <= Date.now();
    const signupsOpen = event.status === 'published' && !hasStarted;

    // The AttendeeList component still expects the snake_case Supabase shape.
    // Map the read model to it inline to keep the component unchanged.
    const attendeesForList = event.attendees.map((a) => ({
        user_id: a.userId,
        joined_at: a.joinedAt.toISOString(),
        profiles: {
            display_name: a.profile.displayName,
            first_name: a.profile.firstName,
            last_name: a.profile.lastName,
            avatar_url: a.profile.avatarUrl,
        },
    }));

    return (
        <article className="mx-auto max-w-3xl space-y-8">
            <Link href="/events" className="text-sm text-primary hover:underline">
                ← Back to events
            </Link>

            <header className="space-y-2">
                <EventTags
                    type={event.type}
                    surface={event.surface}
                    skillLevel={event.skillLevel}
                    format={event.format}
                    gender={event.gender}
                    status={event.status}
                />
                <h1 className="text-3xl font-bold text-fg">{event.title}</h1>
            </header>

            <section className="rounded-lg border border-border-base bg-fg/5 p-3">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    Share
                </h2>
                <EventShareLink shortCode={event.shortCode} />
            </section>

            <HostsSection
                eventId={event.id}
                primaryHostUser={event.primaryHostUser}
                primaryHostGroup={event.primaryHostGroup}
                coHostUsers={event.coHostUsers}
                coHostGroups={event.coHostGroups}
                canManage={event.canManage}
                viewerHostableGroups={event.viewerHostableGroups}
                returnPath={returnPath}
            />

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-border-base p-4">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                        When
                    </h2>
                    <p className="mt-1 font-medium text-fg">{formatEventDateLong(event.startsAt)}</p>
                    <p className="text-sm text-muted">to {formatEventDateLong(event.endsAt)}</p>
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

            {event.type === 'open_play' && (
                <section>
                    <h2 className="mb-3 text-lg font-semibold text-fg">
                        Players signed up{' '}
                        <span className="text-sm font-normal text-muted">
                            ({event.attendees.length})
                        </span>
                    </h2>
                    <AttendeeList
                        attendees={attendeesForList}
                        currentUserId={user?.id ?? null}
                        friendIds={friendIds}
                        returnPath={returnPath}
                    />
                </section>
            )}

            <section className="rounded-lg border border-border-base p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Hosted on PickupVB
                </h2>
                <p className="mt-2 text-sm text-muted">
                    Event ID: <code className="rounded bg-fg/5 px-1 text-xs">{event.id}</code>
                </p>
            </section>

            {event.type === 'open_play' && signupsOpen && (
                <RsvpPanel
                    eventId={event.id}
                    eventTitle={event.title}
                    isAttending={event.isAttending}
                    isRealUser={isRealUser}
                    rsvp={pickQuery(searchParams, 'rsvp')}
                    rsvpMsg={pickQuery(searchParams, 'rsvp_msg')}
                />
            )}

            {event.type === 'tournament' && signupsOpen && (
                <TournamentSignupPanel
                    eventId={event.id}
                    eventFormat={event.format}
                    teams={event.teams}
                    viewerCaptainedTeams={event.viewerCaptainedTeams}
                    viewerId={user?.id ?? null}
                    isRealUser={isRealUser}
                    returnPath={returnPath}
                    {...(pickQuery(searchParams, 'team')
                        ? { resultCode: pickQuery(searchParams, 'team') }
                        : {})}
                />
            )}

            {event.type === 'tournament' && signupsOpen && (
                <FreeAgentSignupPanel
                    eventId={event.id}
                    freeAgents={event.freeAgents.map((f) => ({
                        userId: f.userId,
                        notes: f.notes,
                        profile: {
                            displayName: f.profile.displayName,
                            avatarUrl: f.profile.avatarUrl,
                        },
                    }))}
                    isFreeAgent={event.isFreeAgent}
                    viewerId={user?.id ?? null}
                    isRealUser={isRealUser}
                    returnPath={returnPath}
                    {...(pickQuery(searchParams, 'fa')
                        ? { resultCode: pickQuery(searchParams, 'fa') }
                        : {})}
                />
            )}

            {event.status === 'published' && hasStarted && (
                <p className="rounded-lg border border-border-base bg-fg/5 p-3 text-sm text-muted">
                    Signups for this event are closed because it has already started.
                </p>
            )}

            {event.type === 'tournament' && (
                <section className="rounded-lg border border-border-base bg-fg/5 p-4">
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <h2 className="text-base font-semibold text-fg">Bracket</h2>
                            <p className="text-xs text-muted">
                                Set up the tournament bracket and report match
                                results.
                            </p>
                        </div>
                        <Link
                            href={`/events/${event.id}/bracket` as Route}
                            className="rounded bg-primary px-3 py-1 text-sm text-primary-fg"
                        >
                            Open bracket
                        </Link>
                    </div>
                </section>
            )}
        </article>
    );
}
