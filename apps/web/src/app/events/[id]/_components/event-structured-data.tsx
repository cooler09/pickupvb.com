import { EventJsonLd } from './event-jsonld';
import { BreadcrumbJsonLd } from '@/app/_components/breadcrumb-jsonld';
import type { EventDetailReadModel } from '@pickupvb/domain';

export function EventStructuredData({
  event,
  ticketCents,
}: {
  event: EventDetailReadModel;
  ticketCents: number | null;
}) {
  if (event.visibility !== 'public') return null;
  return (
    <>
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
        organizerName={event.primaryHostGroup?.name ?? event.primaryHostUser?.displayName ?? null}
        ticketCents={ticketCents}
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: 'https://pickupvb.com/' },
          { name: 'Events', url: 'https://pickupvb.com/events' },
          { name: event.title, url: `https://pickupvb.com/events/${event.id}` },
        ]}
      />
    </>
  );
}
