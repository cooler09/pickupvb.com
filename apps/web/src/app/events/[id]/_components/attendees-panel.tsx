import { AttendeeList } from '@/components/attendee-list';
import { Pagination } from '@/components/pagination';
import type { EventDetailReadModel } from '@pickupvb/domain';
import type { AttendeeListRow, AttendeePaymentInfo } from '../_loaders/load-event-detail';

const ATTENDEES_PER_PAGE = 30;

export function AttendeesPanel({
  event,
  attendees,
  currentUserId,
  friendIds,
  returnPath,
  payments,
  paid,
  page,
  searchParams,
}: {
  event: EventDetailReadModel;
  attendees: AttendeeListRow[];
  currentUserId: string | null;
  friendIds: Set<string>;
  returnPath: string;
  payments: Map<string, AttendeePaymentInfo> | undefined;
  paid: boolean;
  page: number;
  searchParams: Record<string, string | undefined>;
}) {
  if (event.type !== 'open_play') return null;
  // Off-platform events may have signups happening outside the platform
  // (cash at the door, host's own form, etc.). The on-platform roster is
  // partial at best, so suppress it to avoid presenting a misleading list.
  if (event.paymentsOffPlatform) return null;
  // Open-play with unlimited capacity has no upper bound on roster size, so
  // page the rendered list; hosts who want the whole roster use the CSV export.
  const pageAttendees = attendees.slice((page - 1) * ATTENDEES_PER_PAGE, page * ATTENDEES_PER_PAGE);
  return (
    <section id="attendees">
      <h2 className="text-fg mb-3 text-lg font-semibold">
        Players signed up{' '}
        <span className="text-muted text-sm font-normal">({event.attendees.length})</span>
      </h2>
      <AttendeeList
        attendees={pageAttendees}
        currentUserId={currentUserId}
        friendIds={friendIds}
        returnPath={returnPath}
        eventId={event.id}
        {...(payments ? { payments } : {})}
        canManagePayments={paid && event.canManage}
      />
      {attendees.length > ATTENDEES_PER_PAGE && (
        <div className="mt-3">
          <Pagination
            basePath={returnPath}
            page={page}
            pageSize={ATTENDEES_PER_PAGE}
            total={attendees.length}
            searchParams={searchParams}
            pageParam="apage"
            scrollToId="attendees"
          />
        </div>
      )}
    </section>
  );
}
