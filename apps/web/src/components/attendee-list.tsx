import Image from 'next/image';
import Link from 'next/link';
import { addFriend, removeFriend } from '@/app/friends/actions';
import { setAttendeePaymentStatus } from '@/app/events/[id]/manage-payments-actions';
import { SubmitButton } from '@/components/submit-button';
import { neutralButtonClass, tonalButtonClass } from '@/components/primary-button';
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
  /** Vanity handle for the player profile URL. Falls back to user_id. */
  handle?: string | null;
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
      <p className="border-border-base text-muted rounded-shape-sm border border-dashed p-4 text-sm">
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
            className="border-border-base rounded-shape-sm flex items-center gap-3 border px-3 py-2"
          >
            <Link
              href={`/players/${a.handle ?? a.user_id}`}
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
                  className="bg-primary/15 text-primary flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold"
                >
                  {initialsOf(a.profiles)}
                </span>
              )}
              <span className="text-fg hover:text-primary min-w-0 flex-1 truncate text-sm font-medium">
                {name}
                {isYou && <span className="text-muted ml-1 text-xs font-normal">(you)</span>}
                {a.position && (
                  <span className="text-muted ml-1 text-xs font-normal">
                    · {POSITION_LABEL[a.position] ?? a.position}
                  </span>
                )}
                {a.waitlist && (
                  <span className="bg-md-warning/15 text-md-warning ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                    Waitlist
                  </span>
                )}
                {pay && pay.status === 'paid' && (
                  <span
                    className="bg-md-success/15 text-md-success ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
                    title={pay.viaStripe ? 'Paid via Stripe' : 'Marked paid by host'}
                  >
                    Paid
                  </span>
                )}
                {pay && pay.status === 'none' && (
                  <span
                    className="ml-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-rose-800 uppercase"
                    title="Has not paid yet"
                  >
                    Unpaid
                  </span>
                )}
                {pay && pay.status === 'pending' && (
                  <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-slate-700 uppercase">
                    Pending
                  </span>
                )}
              </span>
            </Link>
            {canManagePayments &&
              eventId &&
              pay &&
              !pay.viaStripe &&
              (pay.status === 'none' || pay.status === 'paid') && (
                <form
                  action={setAttendeePaymentStatus.bind(
                    null,
                    eventId,
                    a.user_id,
                    pay.status === 'paid' ? 'none' : 'paid',
                  )}
                >
                  <SubmitButton
                    className={
                      pay.status === 'paid'
                        ? `${neutralButtonClass('sm')} tap-target`
                        : // No M3 `success*` vocab yet (persona-ux H-3 documented gap), so the
                          // "mark paid" affirmative keeps its emerald fill; tap-target lifts it
                          // to the 44px touch target like its siblings.
                          'tap-target rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50'
                    }
                    title={pay.status === 'paid' ? 'Mark as unpaid' : 'Mark as paid'}
                  >
                    {pay.status === 'paid' ? 'Unmark paid' : 'Mark paid'}
                  </SubmitButton>
                </form>
              )}
            {currentUserId &&
              !isYou &&
              (isFriend ? (
                <form action={removeFriend.bind(null, a.user_id, returnPath)}>
                  <SubmitButton
                    className={`${neutralButtonClass('sm')} tap-target`}
                    title={`Unfollow ${name}`}
                  >
                    ✓ Following
                  </SubmitButton>
                </form>
              ) : (
                <form action={addFriend.bind(null, a.user_id, returnPath)}>
                  <SubmitButton
                    className={`${tonalButtonClass('sm')} tap-target`}
                    title={`Follow ${name}`}
                  >
                    + Follow
                  </SubmitButton>
                </form>
              ))}
            {!currentUserId && !isYou && (
              <Link
                href={`/login?next=${encodeURIComponent(returnPath)}`}
                className={`${neutralButtonClass('sm')} tap-target`}
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
