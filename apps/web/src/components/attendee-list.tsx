import Image from 'next/image';
import Link from 'next/link';
import { addFriend, removeFriend } from '@/app/friends/actions';
import { setAttendeePaymentStatus } from '@/app/events/[id]/manage-payments-actions';
import { POSITION_LABEL } from '@/lib/enum-labels';

type AttendeeProfile = {
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
};

type Attendee = {
    user_id: string;
    joined_at: string;
    /** Position chosen for events with positional sign-up. */
    position?: string | null;
    /** True when the attendee pushed their position past its configured count. */
    waitlist?: boolean;
    profiles: AttendeeProfile | null;
};

export type AttendeePaymentInfo = {
    /** 'none' | 'pending' | 'paid' | 'refunded' */
    status: string;
    /** True when the row was paid via Stripe — manual toggle is disabled. */
    viaStripe: boolean;
};

function initialsOf(p: AttendeeProfile | null): string {
    if (!p) return '?';
    const f = p.first_name?.trim()?.[0];
    const l = p.last_name?.trim()?.[0];
    if (f && l) return (f + l).toUpperCase();
    const parts = (p.display_name ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    return (p.display_name ?? '?').slice(0, 2).toUpperCase();
}

function nameOf(p: AttendeeProfile | null): string {
    if (!p) return 'Player';
    const full = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    return full || p.display_name || 'Player';
}

export function AttendeeList({
    attendees,
    currentUserId,
    friendIds,
    returnPath,
    eventId,
    payments,
    canManagePayments,
}: {
    attendees: Attendee[];
    currentUserId: string | null;
    friendIds: Set<string>;
    returnPath: string;
    /** Required when payments map / canManagePayments is provided. */
    eventId?: string;
    /** userId -> payment info. Omit for free events. */
    payments?: Map<string, AttendeePaymentInfo>;
    /** True when the viewer can flip manual payment status. */
    canManagePayments?: boolean;
}) {
    if (attendees.length === 0) {
        return (
            <p className="rounded-lg border border-dashed border-border-base p-4 text-sm text-muted">
                No one&apos;s signed up yet — be the first!
            </p>
        );
    }

    return (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {attendees.map((a) => {
                const name = nameOf(a.profiles);
                const isYou = a.user_id === currentUserId;
                const isFriend = friendIds.has(a.user_id);
                const pay = payments?.get(a.user_id);
                return (
                    <li
                        key={a.user_id}
                        className="flex items-center gap-3 rounded-lg border border-border-base px-3 py-2"
                    >
                        <Link
                            href={`/players/${a.user_id}`}
                            className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-90"
                        >
                            {a.profiles?.avatar_url ? (
                                <Image
                                    src={a.profiles.avatar_url}
                                    alt=""
                                    width={36}
                                    height={36}
                                    className="h-9 w-9 rounded-full object-cover"
                                />
                            ) : (
                                <span
                                    aria-hidden="true"
                                    className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
                                >
                                    {initialsOf(a.profiles)}
                                </span>
                            )}
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg hover:text-primary">
                                {name}
                                {isYou && (
                                    <span className="ml-1 text-xs font-normal text-muted">(you)</span>
                                )}
                                {a.position && (
                                    <span className="ml-1 text-xs font-normal text-muted">
                                        · {POSITION_LABEL[a.position] ?? a.position}
                                    </span>
                                )}
                                {a.waitlist && (
                                    <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                                        Waitlist
                                    </span>
                                )}
                                {pay && pay.status === 'paid' && (
                                    <span
                                        className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800"
                                        title={pay.viaStripe ? 'Paid via Stripe' : 'Marked paid by host'}
                                    >
                                        Paid
                                    </span>
                                )}
                                {pay && pay.status === 'none' && (
                                    <span
                                        className="ml-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-800"
                                        title="Has not paid yet"
                                    >
                                        Unpaid
                                    </span>
                                )}
                                {pay && pay.status === 'pending' && (
                                    <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                                        Pending
                                    </span>
                                )}
                            </span>
                        </Link>
                        {canManagePayments && eventId && pay && !pay.viaStripe && (pay.status === 'none' || pay.status === 'paid') && (
                            <form
                                action={setAttendeePaymentStatus.bind(
                                    null,
                                    eventId,
                                    a.user_id,
                                    pay.status === 'paid' ? 'none' : 'paid',
                                )}
                            >
                                <button
                                    type="submit"
                                    className={
                                        pay.status === 'paid'
                                            ? 'rounded-md border border-border-base px-2 py-1 text-xs text-fg/70 hover:bg-fg/5'
                                            : 'rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700'
                                    }
                                    title={pay.status === 'paid' ? 'Mark as unpaid' : 'Mark as paid'}
                                >
                                    {pay.status === 'paid' ? 'Unmark paid' : 'Mark paid'}
                                </button>
                            </form>
                        )}
                        {currentUserId && !isYou && (
                            isFriend ? (
                                <form action={removeFriend.bind(null, a.user_id, returnPath)}>
                                    <button
                                        type="submit"
                                        className="rounded-md border border-border-base px-2 py-1 text-xs text-fg/70 hover:bg-fg/5"
                                        title={`Unfollow ${name}`}
                                    >
                                        ✓ Following
                                    </button>
                                </form>
                            ) : (
                                <form action={addFriend.bind(null, a.user_id, returnPath)}>
                                    <button
                                        type="submit"
                                        className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                                        title={`Follow ${name}`}
                                    >
                                        + Follow
                                    </button>
                                </form>
                            )
                        )}
                        {!currentUserId && !isYou && (
                            <Link
                                href={`/login?next=${encodeURIComponent(returnPath)}`}
                                className="rounded-md border border-border-base px-2 py-1 text-xs text-fg/70 hover:bg-fg/5"
                            >
                                Sign in to follow
                            </Link>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}
