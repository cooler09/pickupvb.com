import type {
  AnalyticsActorId,
  AnalyticsEvent,
  AnalyticsPort,
  AnalyticsTraits,
} from '@pickupvb/domain';
import { analyticsFromEnv } from '@pickupvb/infrastructure';
import { hasAnalyticsConsent } from './consent';

/**
 * Consent-gated decorator over any `AnalyticsPort`. Reads the
 * per-request consent state (see {@link hasAnalyticsConsent}) and
 * drops captures / identifies when the user has opted out.
 *
 * Why fire-and-forget:
 *  - `AnalyticsPort.capture` returns `void` by contract (the port is
 *    consumed from sync code paths like the application-layer outbox
 *    in [JoinEventHandler](../../../../packages/application/src/commands/join-event.handler.ts)).
 *  - The consent read is async (cookies + headers). Awaiting inside
 *    every capture would force the port to be async, cascading into
 *    every handler. Instead we kick off the gated dispatch as a
 *    floating promise. The race between "function freezes" and
 *    "PostHog flush completes" is identical to the existing
 *    unwrapped path — PostHog's `flushAt: 1` flushes per-call.
 *  - All errors are swallowed (the underlying adapter already
 *    swallows network errors; we layer another try/catch around the
 *    consent read so a missing request scope can't propagate).
 *
 * Where the gate does **not** apply:
 *  - Stripe webhooks (no user cookies in the request) — the consent
 *    cookie is absent so the default decision applies. Under the
 *    US-first opt-out posture that's `granted`, which matches our
 *    intent: webhook-driven business events keep flowing.
 *  - Background scripts (no request scope) — `hasAnalyticsConsent`
 *    will throw inside `cookies()`; the try/catch suppresses it and
 *    we fall through to the underlying adapter so cron jobs still
 *    capture. Document any new such caller.
 */
export class ConsentGatedAnalytics implements AnalyticsPort {
  constructor(private readonly inner: AnalyticsPort) {}

  capture(event: AnalyticsEvent, actorId?: AnalyticsActorId): void {
    void this.gated(() => this.inner.capture(event, actorId));
  }

  identify(actorId: AnalyticsActorId, traits: AnalyticsTraits): void {
    void this.gated(() => this.inner.identify(actorId, traits));
  }

  async shutdown(): Promise<void> {
    await this.inner.shutdown();
  }

  private async gated(forward: () => void): Promise<void> {
    let allow: boolean;
    try {
      allow = await hasAnalyticsConsent();
    } catch {
      // No request scope (e.g. cron) — fall through to the inner
      // adapter so non-browser captures still land.
      allow = true;
    }
    if (allow) forward();
  }
}

/**
 * Composition root for the analytics port. Wraps `analyticsFromEnv()`
 * (PostHog when configured, noop otherwise) in the consent gate so
 * every server-side capture honors the user's banner choice.
 *
 * One instance per serverless container — PostHog's `flushAt: 1` is
 * still in effect, so reuse is safe.
 */
export const analytics: AnalyticsPort = new ConsentGatedAnalytics(analyticsFromEnv());
