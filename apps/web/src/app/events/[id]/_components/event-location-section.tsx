import EventMap from './event-map-lazy';
import type { EventDetailReadModel } from '@pickupvb/domain';

export function EventLocationSection({ event }: { event: EventDetailReadModel }) {
  return (
    <section className="space-y-2">
      <h2 className="text-fg text-lg font-semibold">Where</h2>
      {event.venueName && <p className="text-fg font-medium">{event.venueName}</p>}
      <p className="text-fg/90">{event.location.addressLine}</p>
      <p className="text-muted text-sm">
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
        className="text-primary text-sm hover:underline"
      >
        Open in map <span aria-hidden="true">↗</span>
        <span className="sr-only"> (opens in new tab)</span>
      </a>
    </section>
  );
}
