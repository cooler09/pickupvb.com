import type {
  AnalyticsActorId,
  AnalyticsEvent,
  AnalyticsPort,
  AnalyticsTraits,
} from '@pickupvb/domain';

/**
 * Default `AnalyticsPort` used when no vendor is configured (local dev,
 * CI, prod without `POSTHOG_API_KEY`). Silent and side-effect-free.
 */
export class NoopAnalytics implements AnalyticsPort {
  identify(_actorId: AnalyticsActorId, _traits: AnalyticsTraits): void {
    // intentional no-op
  }
  capture(_event: AnalyticsEvent, _actorId?: AnalyticsActorId): void {
    // intentional no-op
  }
  async shutdown(): Promise<void> {
    // intentional no-op
  }
}
