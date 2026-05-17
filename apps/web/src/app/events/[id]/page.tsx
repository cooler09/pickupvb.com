import Link from 'next/link';
import type { Route } from 'next';
import type { Metadata } from 'next/types';
import { notFound } from 'next/navigation';
import { GetEventDetailQuery } from '@pickupvb/application';
import { NotFoundError } from '@pickupvb/domain';
import { handlers } from '@/lib/handlers';
import { getViewer, isAnonymousUser } from '@/lib/server-auth';
import { formatEventDateLong } from '@/lib/date-formats';
import { getEventPricing, attendeeChargeBreakdownAsync, isPaidEvent } from '@/lib/event-pricing';
import { AttendeeList } from '@/components/attendee-list';
import { Alert } from '@/components/alert';
import { EventTags } from './_components/event-tags';
import { EventShareLink } from './_components/event-share-link';
import { EventJsonLd } from './_components/event-jsonld';
import { HostsSection } from './_components/hosts-section';
import { PaidTicketPanel } from './_components/paid-ticket-panel';
import { PositionRsvpPanel } from './_components/position-rsvp-panel';
import { RsvpPanel } from './_components/rsvp-panel';
import { TournamentSignupPanel } from './_components/tournament-signup-panel';
import { FreeAgentSignupPanel } from './_components/free-agent-signup-panel';
import EventMap from './_components/event-map-lazy';
import { TipJar } from './_components/tip-jar';
import { HostBroadcastPanel } from './_components/host-broadcast-panel';

export const dynamic = 'force-dynamic';

export async function generateMetadata(
    props: { params: Promise<{ id: string }> },
): Promise<Metadata> {
    const { id } = await props.params;
    let event;
    try {
        event = await handlers.getEventDetail.execute(new GetEventDetailQuery(id, null));
    } catch {
        return { title: 'Event — PickupVB' };
    }
    // Don't expose non-public events to crawlers.
    const isPublic = event.visibility === 'public';
    const dateLabel = formatEventDateLong(event.startsAt);
    const placeLabel = `${event.location.city}, ${event.location.region}`;
    const summary = event.description
        ? event.description.slice(0, 200)
        : `${event.title} — ${dateLabel} · ${placeLabel}. Sign up on PickupVB.`;
    const title = `${event.title} — ${dateLabel} · ${placeLabel}`;
    const canonical = `/events/${event.id}`;
    return {
        title,
        description: summary,
        alternates: { canonical },
        ...(isPublic
            ? {}
            : { robots: { index: false, follow: false } }),
        openGraph: {
            title,
            description: summary,
            url: canonical,
            type: 'website',
            siteName: 'PickupVB',
        },
        twitter: {
            card: 'summary_large_image',
            title,
            description: summary,
        },
    };
}

function pickQuery(
    searchParams: Record<string, string | string[] | undefined> | undefined,
    key: string,
): string | undefined {
    const v = searchParams?.[key];
    return Array.isArray(v) ? v[0] : v;
}

export default async function EventDetailPage(
    props: {
        params: Promise<{ id: string }>;
        searchParams?: Promise<Record<string, string | string[] | undefined>>;
    }
) {
    const searchParams = await props.searchParams;
    const params = await props.params;
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

    // Pricing is read separately from the aggregate — see lib/event-pricing.ts.
    const pricing = await getEventPricing(event.id);
    const paid = isPaidEvent(pricing);

    // Side-loads below are all independent of each other. Run in parallel.
    const isHostOfEvent = !!user && event.canManage;
    const needsViewerPayment = paid && !!user && event.isAttending;
    const needsManagePayments = paid && event.canManage;

    const [breakdown, viewerIsPro, tipTotalCents, payments, viewerPaymentStatus] = await Promise.all([
        pricing && paid ? attendeeChargeBreakdownAsync(pricing) : Promise.resolve(null),
        event.canManage && user
            ? (await import('@/lib/pro')).isPro(user.id)
            : Promise.resolve(false),
        // Tip-jar totals (cheap RPC). Hidden from the host themselves.
        isHostOfEvent
            ? Promise.resolve(0)
            : (async () => {
                const { getAdminSupabase } = await import('@/lib/supabase-admin');
                const { data: tipTotal } = await getAdminSupabase().rpc(
                    'event_tip_total_cents',
                    { p_event_id: event.id } as never,
                );
                return Number(tipTotal ?? 0);
            })(),
        // For paid events, side-load per-attendee payment status (admin client —
        // visibility is host-only). Free events get undefined.
        needsManagePayments
            ? (async () => {
                const { getAdminSupabase } = await import('@/lib/supabase-admin');
                const { data: payRows } = await getAdminSupabase()
                    .from('event_attendees')
                    .select('user_id, payment_status, payment_intent_id')
                    .eq('event_id', event.id);
                type PayRow = {
                    user_id: string;
                    payment_status: string;
                    payment_intent_id: string | null;
                };
                const map = new Map<string, { status: string; viaStripe: boolean }>();
                for (const r of (payRows as PayRow[] | null) ?? []) {
                    map.set(r.user_id, {
                        status: r.payment_status,
                        viaStripe: !!r.payment_intent_id,
                    });
                }
                return map;
            })()
            : Promise.resolve(undefined),
        // For paid events, also look up the viewer's own payment status so the
        // RSVP panel can show "paid / pending / due" badges.
        needsViewerPayment
            ? (async () => {
                const supabaseForViewer = await (await import('@/lib/supabase')).getServerSupabase();
                const { data: row } = await supabaseForViewer
                    .from('event_attendees')
                    .select('payment_status')
                    .eq('event_id', event.id)
                    .eq('user_id', user!.id)
                    .maybeSingle();
                const raw = (row as { payment_status?: string } | null)?.payment_status;
                return raw === 'paid' || raw === 'pending' || raw === 'none' ? raw : undefined;
            })()
            : Promise.resolve(undefined),
    ]);

    // The AttendeeList component still expects the snake_case Supabase shape.
    // Map the read model to it inline to keep the component unchanged.
    const attendeesForList = event.attendees.map((a) => ({
        user_id: a.userId,
        joined_at: a.joinedAt.toISOString(),
        position: a.position,
        waitlist: a.waitlist,
        handle: a.profile.handle,
        profiles: {
            display_name: a.profile.displayName,
            first_name: a.profile.firstName,
            last_name: a.profile.lastName,
            avatar_url: a.profile.avatarUrl,
        },
    }));

    // Per-position fill counts for the positional RSVP panel.
    const filledByPosition: Partial<Record<string, number>> = {};
    for (const a of event.attendees) {
        if (!a.position) continue;
        filledByPosition[a.position] = (filledByPosition[a.position] ?? 0) + 1;
    }
    const viewerPosition = user
        ? event.attendees.find((a) => a.userId === user.id)?.position ?? null
        : null;

    return (
        <article className="mx-auto max-w-3xl space-y-8">
            {event.visibility === 'public' && (
                <EventJsonLd
                    id={event.id}
                    title={event.title}
                    description={event.description}
                    startsAt={event.startsAt}
                    endsAt={event.endsAt}
                    visibility={event.visibility}
                    status={event.status}
                    spotsRemaining={event.spotsRemaining}
                    attendeeCount={event.attendeeCount}
                    location={event.location}
                    organizerName={
                        event.primaryHostGroup?.name
                        ?? event.primaryHostUser?.displayName
                        ?? null
                    }
                    ticketCents={breakdown?.ticketCents ?? null}
                />
            )}
            <Link href="/events" className="text-sm text-primary hover:underline">
                ← Back to events
            </Link>

            {pickQuery(searchParams, 'created') === '1' && (
                <Alert variant="success" title="Event created!">
                    Share the link above or invite co-hosts so players can find your event.
                </Alert>
            )}

            {pickQuery(searchParams, 'tip') === 'thanks' && (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
                    Thanks for tipping the host!
                </div>
            )}
            {pickQuery(searchParams, 'tip') === 'cancel' && (
                <div className="rounded-lg border border-border-base bg-surface p-3 text-sm">
                    Tip cancelled.
                </div>
            )}
            {pickQuery(searchParams, 'tip') === 'error' && (
                <div className="rounded-lg border border-secondary bg-secondary/10 p-3 text-sm">
                    {pickQuery(searchParams, 'tip_msg') ?? 'Could not process tip.'}
                </div>
            )}

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
                <div className="flex flex-wrap items-center gap-3 text-sm">
                    <EventShareLink shortCode={event.shortCode} title={event.title} />
                    {event.canManage && (
                        <Link
                            href={`/events/${event.id}/edit` as Route}
                            className="text-primary hover:underline"
                        >
                            Edit event
                        </Link>
                    )}
                </div>
            </header>

            <section className="overflow-hidden rounded-lg border border-border-base sm:grid sm:grid-cols-2">
                <div className="p-4 sm:border-r sm:border-border-base">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                        When
                    </h2>
                    <p className="mt-1 font-medium text-fg">{formatEventDateLong(event.startsAt)}</p>
                    <p className="text-sm text-muted">to {formatEventDateLong(event.endsAt)}</p>
                </div>
                <div className="border-t border-border-base p-4 sm:border-l-0 sm:border-t-0">
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

            {event.type === 'open_play' && signupsOpen && (
                paid && breakdown ? (
                    <PaidTicketPanel
                        eventId={event.id}
                        eventTitle={event.title}
                        isAttending={event.isAttending}
                        isRealUser={isRealUser}
                        ticketCents={breakdown.ticketCents}
                        platformFeeCents={breakdown.platformFeeCents}
                        refundWindowHours={pricing!.refundWindowHours}
                        {...(viewerPaymentStatus ? { viewerPaymentStatus } : {})}
                    />
                ) : event.positionRoster ? (
                    <PositionRsvpPanel
                        eventId={event.id}
                        eventTitle={event.title}
                        isAttending={event.isAttending}
                        isRealUser={isRealUser}
                        positionRoster={event.positionRoster}
                        filledByPosition={filledByPosition}
                        viewerPosition={viewerPosition}
                        rsvp={pickQuery(searchParams, 'rsvp')}
                        rsvpMsg={pickQuery(searchParams, 'rsvp_msg')}
                    />
                ) : (
                    <RsvpPanel
                        eventId={event.id}
                        eventTitle={event.title}
                        isAttending={event.isAttending}
                        isRealUser={isRealUser}
                        rsvp={pickQuery(searchParams, 'rsvp')}
                        rsvpMsg={pickQuery(searchParams, 'rsvp_msg')}
                    />
                )
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

            {event.canManage && (
                <HostBroadcastPanel
                    eventId={event.id}
                    attendeeCount={event.attendees.filter((a) => !a.waitlist).length}
                />
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
                        eventId={event.id}
                        {...(payments ? { payments } : {})}
                        canManagePayments={paid && event.canManage}
                    />
                    {event.canManage && (
                        <p className="mt-3 text-xs text-muted">
                            {viewerIsPro ? (
                                <a
                                    href={`/api/events/${event.id}/attendees.csv`}
                                    className="text-primary hover:underline"
                                >
                                    Export attendees as CSV
                                </a>
                            ) : (
                                <>
                                    CSV attendee export is a{' '}
                                    <Link
                                        href={'/profile/billing/pro' as Route}
                                        className="text-primary hover:underline"
                                    >
                                        Pro
                                    </Link>{' '}
                                    feature.
                                </>
                            )}
                        </p>
                    )}
                </section>
            )}

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

            {!isHostOfEvent && (
                <TipJar
                    eventId={event.id}
                    viewerIsRealUser={isRealUser}
                    viewerHasSession={!!user}
                    totalCents={tipTotalCents}
                />
            )}
        </article>
    );
}
