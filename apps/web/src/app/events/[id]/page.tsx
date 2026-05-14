import Link from 'next/link';
import dynamicImport from 'next/dynamic';
import { notFound } from 'next/navigation';
import { GetEventByIdQuery } from '@pickupvb/application';
import { handlers } from '@/lib/handlers';
import { getServerSupabase } from '@/lib/supabase';
import { AttendeeList } from '@/components/attendee-list';
import { ConfirmSubmitButton } from '@/components/confirm-submit-button';
import { addEventCoHost, removeEventCoHost } from '@/app/groups/actions';
import GuestSignupForm from './guest-signup-form';
import { joinEvent, leaveEvent } from './rsvp-actions';

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

export default async function EventDetailPage({
    params,
    searchParams,
}: {
    params: { id: string };
    searchParams?: Record<string, string | string[] | undefined>;
}) {
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

    // An anonymous (guest) session counts as "no real account" for UI gating:
    // they get the guest signup form / claim CTA instead of the full app shell.
    const isAnon = Boolean(user && (user as { is_anonymous?: boolean }).is_anonymous);
    const isRealUser = Boolean(user) && !isAnon;

    // Load the viewer's existing friend edges so we can mark "✓ Friend" inline.
    let friendIds = new Set<string>();
    if (isRealUser && user) {
        const { data: friendRows } = await supabase
            .from('friendships')
            .select('friend_id')
            .eq('user_id', user.id);
        const rows = (friendRows as { friend_id: string }[] | null) ?? [];
        friendIds = new Set(rows.map((r) => r.friend_id));
    }

    // ---- Hosts (primary user, primary group, co-hosts) ---------------------
    const { data: eventRow } = await supabase
        .from('events')
        .select('host_id, host_group_id')
        .eq('id', event.id)
        .maybeSingle();
    const hostRow = eventRow as { host_id: string; host_group_id: string | null } | null;

    type ProfileLite = {
        id: string;
        display_name: string;
        first_name: string | null;
        last_name: string | null;
        avatar_url: string | null;
    };
    type GroupLite = { id: string; name: string; avatar_url: string | null; slug: string };

    let primaryHostUser: ProfileLite | null = null;
    if (hostRow?.host_id) {
        const { data } = await supabase
            .from('profiles')
            .select('id, display_name, first_name, last_name, avatar_url')
            .eq('id', hostRow.host_id)
            .maybeSingle();
        primaryHostUser = (data as ProfileLite | null) ?? null;
    }

    let primaryHostGroup: GroupLite | null = null;
    if (hostRow?.host_group_id) {
        const { data } = await supabase
            .from('groups')
            .select('id, name, avatar_url, slug')
            .eq('id', hostRow.host_group_id)
            .maybeSingle();
        primaryHostGroup = (data as GroupLite | null) ?? null;
    }

    const { data: coHostRows } = await supabase
        .from('event_co_hosts')
        .select('host_user_id, host_group_id')
        .eq('event_id', event.id);
    const coHosts = (coHostRows as { host_user_id: string | null; host_group_id: string | null }[] | null) ?? [];
    const coUserIds = coHosts.map((c) => c.host_user_id).filter((v): v is string => !!v);
    const coGroupIds = coHosts.map((c) => c.host_group_id).filter((v): v is string => !!v);

    const coHostUsers: ProfileLite[] = coUserIds.length
        ? (((await supabase
            .from('profiles')
            .select('id, display_name, first_name, last_name, avatar_url')
            .in('id', coUserIds)).data) as ProfileLite[] | null) ?? []
        : [];
    const coHostGroups: GroupLite[] = coGroupIds.length
        ? (((await supabase
            .from('groups')
            .select('id, name, avatar_url, slug')
            .in('id', coGroupIds)).data) as GroupLite[] | null) ?? []
        : [];

    function profileName(p: ProfileLite): string {
        const full = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
        return full || p.display_name || 'Player';
    }

    // Can the viewer manage this event (add/remove co-hosts)?
    let canManageEvent = false;
    if (user) {
        if (user.id === hostRow?.host_id) {
            canManageEvent = true;
        } else if (hostRow?.host_group_id) {
            const { data: roleRow } = await supabase
                .from('group_members')
                .select('role')
                .eq('group_id', hostRow.host_group_id)
                .eq('user_id', user.id)
                .maybeSingle();
            const role = (roleRow as { role: string } | null)?.role;
            canManageEvent = role === 'owner' || role === 'admin';
        }
    }

    // Groups the viewer can pick as a co-host (owner/admin of).
    let myHostableGroups: { id: string; name: string }[] = [];
    if (canManageEvent && user) {
        const { data } = await supabase
            .from('group_members')
            .select('groups:groups!inner(id, name)')
            .eq('user_id', user.id)
            .in('role', ['owner', 'admin']);
        type Row = { groups: { id: string; name: string } | null };
        myHostableGroups = ((data as Row[] | null) ?? [])
            .map((r) => r.groups)
            .filter((g): g is { id: string; name: string } => g !== null)
            .filter((g) => g.id !== hostRow?.host_group_id && !coGroupIds.includes(g.id));
    }

    const startsAt = new Date(event.startsAt);
    const endsAt = new Date(event.endsAt);
    const returnPath = `/events/${event.id}`;

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

            <section className="space-y-2 rounded-lg border border-border-base p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Hosted by
                </h2>
                <ul className="flex flex-wrap gap-2">
                    {primaryHostGroup && (
                        <li>
                            <Link
                                href={`/groups/${primaryHostGroup.id}`}
                                className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary hover:bg-primary/20"
                            >
                                {primaryHostGroup.avatar_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={primaryHostGroup.avatar_url}
                                        alt=""
                                        className="h-5 w-5 rounded object-cover"
                                    />
                                ) : (
                                    <span aria-hidden="true" className="text-xs">🏐</span>
                                )}
                                {primaryHostGroup.name}
                            </Link>
                        </li>
                    )}
                    {primaryHostUser && (
                        <li>
                            <Link
                                href={`/players/${primaryHostUser.id}`}
                                className="inline-flex items-center gap-2 rounded-full border border-border-base px-3 py-1 text-sm hover:bg-fg/5"
                            >
                                {profileName(primaryHostUser)}
                                {primaryHostGroup && (
                                    <span className="text-xs text-muted">(manager)</span>
                                )}
                            </Link>
                        </li>
                    )}
                    {coHostGroups.map((g) => (
                        <li key={`g-${g.id}`}>
                            <Link
                                href={`/groups/${g.id}`}
                                className="inline-flex items-center gap-2 rounded-full border border-border-base px-3 py-1 text-sm hover:bg-fg/5"
                            >
                                {g.name}
                                <span className="text-xs text-muted">(co-host)</span>
                            </Link>
                            {canManageEvent && (
                                <form
                                    action={removeEventCoHost.bind(null, event.id, { groupId: g.id }, returnPath)}
                                    className="ml-1 inline"
                                >
                                    <button
                                        type="submit"
                                        title="Remove co-host"
                                        className="text-xs text-muted hover:text-red-600"
                                    >
                                        ✕
                                    </button>
                                </form>
                            )}
                        </li>
                    ))}
                    {coHostUsers.map((p) => (
                        <li key={`u-${p.id}`}>
                            <Link
                                href={`/players/${p.id}`}
                                className="inline-flex items-center gap-2 rounded-full border border-border-base px-3 py-1 text-sm hover:bg-fg/5"
                            >
                                {profileName(p)}
                                <span className="text-xs text-muted">(co-host)</span>
                            </Link>
                            {canManageEvent && (
                                <form
                                    action={removeEventCoHost.bind(null, event.id, { userId: p.id }, returnPath)}
                                    className="ml-1 inline"
                                >
                                    <button
                                        type="submit"
                                        title="Remove co-host"
                                        className="text-xs text-muted hover:text-red-600"
                                    >
                                        ✕
                                    </button>
                                </form>
                            )}
                        </li>
                    ))}
                </ul>

                {canManageEvent && (
                    <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-primary hover:underline">
                            + Add co-host
                        </summary>
                        <div className="mt-3 space-y-3">
                            {myHostableGroups.length > 0 && (
                                <form
                                    action={addCoHostFromForm.bind(null, event.id, returnPath)}
                                    className="flex flex-wrap items-end gap-2"
                                >
                                    <input type="hidden" name="kind" value="group" />
                                    <label className="text-xs text-muted">
                                        Group
                                        <select
                                            name="group_id"
                                            defaultValue=""
                                            className="mt-1 block rounded-md border border-border-base bg-surface px-2 py-1 text-sm"
                                        >
                                            <option value="">Pick a group…</option>
                                            {myHostableGroups.map((g) => (
                                                <option key={g.id} value={g.id}>
                                                    {g.name}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <button
                                        type="submit"
                                        className="rounded-md border border-border-base px-3 py-1 text-sm hover:bg-fg/5"
                                    >
                                        Add group
                                    </button>
                                </form>
                            )}
                            <form
                                action={addCoHostFromForm.bind(null, event.id, returnPath)}
                                className="flex flex-wrap items-end gap-2"
                            >
                                <input type="hidden" name="kind" value="user" />
                                <label className="text-xs text-muted">
                                    User ID
                                    <input
                                        name="user_id"
                                        placeholder="UUID from /players/[id]"
                                        className="mt-1 block w-72 rounded-md border border-border-base bg-surface px-2 py-1 text-sm"
                                    />
                                </label>
                                <button
                                    type="submit"
                                    className="rounded-md border border-border-base px-3 py-1 text-sm hover:bg-fg/5"
                                >
                                    Add user
                                </button>
                            </form>
                        </div>
                    </details>
                )}
            </section>

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
                <AttendeeList
                    attendees={attendees}
                    currentUserId={user?.id ?? null}
                    friendIds={friendIds}
                    returnPath={`/events/${event.id}`}
                />
            </section>

            <section className="rounded-lg border border-border-base p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Hosted on PickupVB
                </h2>
                <p className="mt-2 text-sm text-muted">
                    Event ID: <code className="rounded bg-fg/5 px-1 text-xs">{event.id}</code>
                </p>
            </section>

            {event.type === 'open_play' && event.status === 'published' && (() => {
                const rsvp = (() => {
                    const v = searchParams?.['rsvp'];
                    return Array.isArray(v) ? v[0] : v;
                })();
                const rsvpMsg = (() => {
                    const v = searchParams?.['rsvp_msg'];
                    return Array.isArray(v) ? v[0] : v;
                })();
                const banner: { tone: 'success' | 'info' | 'error'; text: string } | null =
                    rsvp === 'joined'
                        ? { tone: 'success', text: "You're in! See you on the court." }
                        : rsvp === 'already'
                            ? { tone: 'info', text: "You're already signed up for this event." }
                            : rsvp === 'left'
                                ? { tone: 'info', text: "You've been removed from this event." }
                                : rsvp === 'notin'
                                    ? { tone: 'info', text: "You weren't signed up for this event." }
                                    : rsvp === 'full'
                                        ? { tone: 'error', text: 'Sorry — this event is full.' }
                                        : rsvp === 'signin'
                                            ? { tone: 'error', text: 'Please sign in to RSVP.' }
                                            : rsvp === 'anon'
                                                ? {
                                                    tone: 'info',
                                                    text: 'Finish creating your account to RSVP from any device.',
                                                }
                                                : rsvp === 'error'
                                                    ? {
                                                        tone: 'error',
                                                        text: rsvpMsg ?? 'Something went wrong. Try again.',
                                                    }
                                                    : null;
                return (
                    <div className="space-y-4">
                        {banner && (
                            <div
                                role="status"
                                className={
                                    banner.tone === 'success'
                                        ? 'rounded-md border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary'
                                        : banner.tone === 'error'
                                            ? 'rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700'
                                            : 'rounded-md border border-border-base bg-highlight/30 px-4 py-2 text-sm text-fg/80'
                                }
                            >
                                {banner.text}
                            </div>
                        )}
                        <div className="flex justify-end gap-2">
                            {isAttending ? (
                                <>
                                    <span className="rounded-md border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
                                        You&apos;re signed up
                                    </span>
                                    <form action={leaveEvent.bind(null, event.id)}>
                                        <ConfirmSubmitButton
                                            label="Leave event"
                                            pendingLabel="Leaving…"
                                            confirmMessage="Remove yourself from this event?"
                                            className="rounded-md border border-border-base px-4 py-2 text-sm font-medium text-fg/80 hover:bg-fg/5 disabled:opacity-50"
                                        />
                                    </form>
                                </>
                            ) : isRealUser ? (
                                <form action={joinEvent.bind(null, event.id)}>
                                    <ConfirmSubmitButton
                                        label="Join this event"
                                        pendingLabel="Joining…"
                                        confirmMessage={`Join "${event.title}"? You'll be added to the attendee list.`}
                                    />
                                </form>
                            ) : (
                                <Link
                                    href={`/login?next=/events/${event.id}`}
                                    className="rounded-md border border-border-base px-4 py-2 text-sm font-medium hover:bg-fg/5"
                                >
                                    Already have an account? Sign in
                                </Link>
                            )}
                        </div>

                        {!isRealUser && !isAttending && (
                            <section className="rounded-lg border border-border-base p-4">
                                <h2 className="text-sm font-semibold text-fg">
                                    Sign up as a guest
                                </h2>
                                <p className="mb-3 text-xs text-muted">
                                    No account needed — just your name.
                                </p>
                                <GuestSignupForm eventId={event.id} />
                            </section>
                        )}
                    </div>
                );
            })()}
        </article>
    );
}

async function addCoHostFromForm(eventId: string, returnPath: string, formData: FormData) {
    'use server';
    const kind = String(formData.get('kind') ?? '');
    if (kind === 'group') {
        const groupId = String(formData.get('group_id') ?? '').trim();
        if (groupId) await addEventCoHost(eventId, { groupId }, returnPath);
    } else if (kind === 'user') {
        const userId = String(formData.get('user_id') ?? '').trim();
        if (userId) await addEventCoHost(eventId, { userId }, returnPath);
    }
}
