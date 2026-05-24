/**
 * Drain an aggregate's pending domain events and ship the mapped
 * analytics captures through the supplied port. Called by application
 * handlers immediately after `repo.save(aggregate)`.
 *
 * Contract:
 *   - Synchronous. The adapter (`PostHogAnalytics`) buffers + flushes
 *     in its own background; the handler doesn't await analytics.
 *   - Fail-quiet on a per-event basis. A throw from either the mapper
 *     or the port is swallowed so analytics can't break a request.
 *   - `pullEvents()` drains the aggregate's buffer — calling this
 *     twice is safe but the second call captures nothing.
 */
import type { AnalyticsPort, VolleyballEvent } from '@pickupvb/domain';
import { mapDomainEventToAnalytics } from './event-analytics-mapper.js';

export function dispatchAnalyticsOutbox(
  aggregate: VolleyballEvent,
  analytics: AnalyticsPort,
): void {
  const events = aggregate.pullEvents();
  for (const de of events) {
    try {
      const mapped = mapDomainEventToAnalytics(de, aggregate);
      if (!mapped) continue;
      analytics.capture(mapped.event, mapped.actorId);
    } catch {
      // best-effort: never break a request on instrumentation.
    }
  }
}
