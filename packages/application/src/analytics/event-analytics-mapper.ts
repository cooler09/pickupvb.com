/**
 * Outbox mapper: domain events → typed analytics events.
 *
 * Why this exists:
 *   - Today every server-action call site builds its own analytics
 *     payload by re-reading event metadata from Supabase. That works
 *     for the few actions we have but means any new caller (webhook,
 *     cron, RPC) can silently miss instrumentation.
 *   - This module centralises the mapping. Handlers call
 *     `dispatchAnalyticsOutbox(aggregate, analytics)` after
 *     `repo.save(...)` and any taxonomy gap is a compile-time error in
 *     the mapper rather than a runtime hole at the call site.
 *
 * Discipline:
 *   - Pure / synchronous. Reads everything off the aggregate; no DB
 *     calls.
 *   - Fail-quiet. Returns `null` for domain events we don't track yet.
 *     Callers swallow throws to keep analytics off the request's
 *     critical path.
 *   - No PII. Same allowlisted props the action layer was building by
 *     hand — `metroId` is the city slug, `priceCents` is the default
 *     division's price, `hostId` is hashed downstream by the adapter.
 */
import type {
  AnalyticsActorId,
  AnalyticsEvent,
  DomainEvent,
  EventScopedProps,
  VolleyballEvent,
} from '@pickupvb/domain';
import { SpotFilled, SpotReleased } from '@pickupvb/domain';

export interface MappedAnalyticsCapture {
  event: AnalyticsEvent;
  actorId: AnalyticsActorId;
}

/**
 * Build the `EventScopedProps` block from the aggregate. Default
 * division (sort_order = 0) supplies `priceCents`; if no divisions
 * exist yet (defensive — the create handler always seeds at least one)
 * we report 0 rather than guess.
 */
function eventScopedProps(evt: VolleyballEvent): EventScopedProps {
  const defaultDivision = evt.divisions.find((d) => d.sortOrder === 0) ?? evt.divisions[0] ?? null;
  return {
    eventId: String(evt.id),
    hostId: String(evt.hostId),
    eventType: evt.type as 'open_play' | 'tournament',
    byPosition: evt.positionRoster != null,
    priceCents: defaultDivision?.priceCents ?? 0,
    metroId: evt.location.city || null,
  };
}

/**
 * Map a single raised domain event to its analytics counterpart, or
 * `null` when the event isn't part of the current product taxonomy.
 * Add new variants here before instrumenting a new domain event.
 */
export function mapDomainEventToAnalytics(
  de: DomainEvent,
  aggregate: VolleyballEvent,
): MappedAnalyticsCapture | null {
  if (de instanceof SpotFilled) {
    return {
      event: {
        name: 'event_joined',
        props: {
          ...eventScopedProps(aggregate),
          waitlist: de.waitlist,
          position: de.position,
        },
      },
      actorId: de.userId,
    };
  }
  if (de instanceof SpotReleased) {
    return {
      event: {
        name: 'event_left',
        props: eventScopedProps(aggregate),
      },
      actorId: de.userId,
    };
  }
  // EventCreated / EventPublished / EventCancelled / TeamRegistered /
  // TeamWithdrawn / FreeAgentJoined / FreeAgentLeft are not in the
  // current analytics taxonomy. Returning null is the correct
  // fail-quiet path — add a variant + analytics-port entry when we
  // start capturing them.
  return null;
}
