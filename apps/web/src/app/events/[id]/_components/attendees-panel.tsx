import Link from 'next/link';
import type { Route } from 'next';
import { AttendeeList } from '@/components/attendee-list';
import type { EventDetailReadModel } from '@pickupvb/domain';
import type { AttendeeListRow, AttendeePaymentInfo } from '../_loaders/load-event-detail';

export function AttendeesPanel({
  event,
  attendees,
  currentUserId,
  friendIds,
  returnPath,
  payments,
  paid,
  viewerIsPro,
}: {
  event: EventDetailReadModel;
  attendees: AttendeeListRow[];
  currentUserId: string | null;
  friendIds: Set<string>;
  returnPath: string;
  payments: Map<string, AttendeePaymentInfo> | undefined;
  paid: boolean;
  viewerIsPro: boolean;
}) {
  if (event.type !== 'open_play') return null;
  // Off-platform events may have signups happening outside the platform
  // (cash at the door, host's own form, etc.). The on-platform roster is
  // partial at best, so suppress it to avoid presenting a misleading list.
  if (event.paymentsOffPlatform) return null;
  return (
    <section id="attendees">
      <h2 className="text-fg mb-3 text-lg font-semibold">
        Players signed up{' '}
        <span className="text-muted text-sm font-normal">({event.attendees.length})</span>
      </h2>
      <AttendeeList
        attendees={attendees}
        currentUserId={currentUserId}
        friendIds={friendIds}
        returnPath={returnPath}
        eventId={event.id}
        {...(payments ? { payments } : {})}
        canManagePayments={paid && event.canManage}
      />
      {event.canManage && (
        <p className="text-muted mt-3 text-xs">
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
              <Link href={'/profile/billing/pro' as Route} className="text-primary hover:underline">
                Pro
              </Link>{' '}
              feature.
            </>
          )}
        </p>
      )}
    </section>
  );
}
