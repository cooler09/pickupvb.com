/**
 * Drain **any** aggregate's pending domain events and ship the mapped
 * analytics captures through the supplied port. The uniform post-`save()`
 * hook — every command handler that persists an aggregate which can raise
 * domain events calls this immediately after `repo.save(aggregate)`, so
 * `raise()` always implies delivery through the outbox (architecture audit
 * P2-4). Whether a given event becomes a capture is the mapper's call — it
 * returns `null` for events outside the current analytics taxonomy
 * (`mapDomainEventToAnalytics`), which is the documented fail-quiet path.
 *
 * Contract:
 *   - Generic over `AggregateRoot` — works for `VolleyballEvent`, `Bracket`,
 *     and any future raising aggregate without a signature change. The mapper
 *     narrows on the concrete type where it needs aggregate context.
 *   - Synchronous. The adapter (`PostHogAnalytics`) buffers + flushes in its
 *     own background; the handler doesn't await analytics.
 *   - Fail-quiet on a per-event basis. A throw from either the mapper or the
 *     port is swallowed so analytics can't break a request.
 *   - `pullEvents()` drains the aggregate's buffer — calling this twice is
 *     safe but the second call captures nothing.
 */
import type { AggregateRoot, AnalyticsPort } from '@pickupvb/domain';
import { mapDomainEventToAnalytics } from './event-analytics-mapper.js';

export function dispatchAnalyticsOutbox(
  aggregate: AggregateRoot<unknown>,
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
