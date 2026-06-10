import Link from 'next/link';
import type { Route } from 'next';
import { LocalDateTime } from '@/components/local-datetime';
import type { HostedEventRow } from '@/components/hosted-events-list';
import { EventActionsMenu } from './event-actions-menu';

/** Signed-up / capacity summary for a row, or just the count when uncapped. */
function capacityLabel(e: HostedEventRow): string {
  if (e.capacity_kind === 'fixed' && e.max_spots !== null) {
    return `${e.attendee_count}/${e.max_spots}`;
  }
  return String(e.attendee_count);
}

/**
 * Compact host-facing events list with a per-row "Manage" link into
 * `/events/[id]/manage`. Used twice on the dashboard (upcoming + recent); each
 * instance is capped by the page, with a "See all" affordance below.
 */
export function HostEventsTable({
  heading,
  events,
  emptyText,
  upcoming,
}: {
  heading: string;
  events: ReadonlyArray<HostedEventRow>;
  emptyText: string;
  /** True for the upcoming list — gates the menu's message/cancel actions. */
  upcoming: boolean;
}) {
  return (
    <section className="border-border-base bg-md-surface-container rounded-shape-sm border p-5 sm:p-6">
      <h2 className="text-fg text-title-lg font-semibold">{heading}</h2>
      {events.length === 0 ? (
        <p className="text-muted mt-3 text-sm">{emptyText}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-muted border-border-base border-b text-left text-xs tracking-wide uppercase">
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Event
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Start
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Signed up
                </th>
                <th scope="col" className="py-2 pr-0 font-semibold">
                  <span className="sr-only">Manage</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-border-base border-b last:border-b-0">
                  <td className="py-2 pr-4">
                    <Link
                      href={`/events/${e.id}` as Route}
                      className="hover:text-primary font-medium"
                    >
                      {e.title}
                    </Link>
                    {e.status !== 'published' && (
                      <span className="bg-md-warning-container text-md-on-warning-container ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold">
                        {e.status}
                      </span>
                    )}
                  </td>
                  <td className="text-muted py-2 pr-4 whitespace-nowrap">
                    <LocalDateTime iso={e.starts_at} variant="dateShort" timeZone={e.time_zone} />
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{capacityLabel(e)}</td>
                  <td className="py-2 pr-0">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/events/${e.id}/manage` as Route}
                        className="text-primary hover:underline"
                      >
                        Manage
                      </Link>
                      <EventActionsMenu
                        eventId={e.id}
                        title={e.title}
                        isUpcoming={upcoming}
                        isCancelled={e.status === 'cancelled'}
                        attendeeCount={e.attendee_count}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
