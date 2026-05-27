import type {
  AnalyticsActorId,
  AnalyticsEvent,
  AnalyticsPort,
  AnalyticsTraits,
} from '@pickupvb/domain';
import { analyticsFromEnv } from '@pickupvb/infrastructure';
import { after } from 'next/server';
import { hasAnalyticsConsent } from './consent';

/**
 * Consent-gated decorator over any `AnalyticsPort`. Reads the
 * per-request consent state (see {@link hasAnalyticsConsent}) and
 * drops captures / identifies when the user has opted out.
 *
 * Why fire-and-forget (with `after()` to extend lifetime):
 *  - `AnalyticsPort.capture` returns `void` by contract (the port is
 *    consumed from sync code paths like the application-layer outbox
 *    in [JoinEventHandler](../../../../packages/application/src/commands/join-event.handler.ts)).
 *  - The consent read is async (cookies + headers). Awaiting inside
 *    every capture would force the port to be async, cascading into
 *    every handler. Instead we kick off the gated dispatch and hand
 *    its promise to Next's `after()` so the serverless invocation
 *    stays alive long enough for the consent check + PostHog flush
 *    to land. Without `after()` the lambda freezes the moment the
 *    response is returned and every enqueued capture is dropped
 *    (the original symptom on prod).
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
    safeAfter(this.gated(() => this.inner.capture(event, actorId)));
  }

  identify(actorId: AnalyticsActorId, traits: AnalyticsTraits): void {
    safeAfter(this.gated(() => this.inner.identify(actorId, traits)));
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
 * Schedule a promise to be awaited after the response is sent.
 * Wraps Next's `after()` so non-request callers (cron, tests) don't
 * blow up — the underlying promise still runs; we just don't extend
 * any lifetime. Hoisted above the class definition so `capture` /
 * `identify` above can reference it.
 *
 * Note: `after()` requires a request scope and is the mechanism that
 * keeps a Vercel serverless function alive long enough for the
 * downstream PostHog HTTP flush to land. Without it the lambda
 * freezes the moment the response is returned and every enqueued
 * capture is silently dropped.
 */
function safeAfter(promise: Promise<unknown>): void {
  try {
    after(promise);
  } catch {
    // Not in a request scope (background worker, test). Fall through
    // to a floating promise — the host is presumed long-lived.
    void promise;
  }
}

/**
 * Composition root for the analytics port. Wraps `analyticsFromEnv()`
 * (PostHog when configured, noop otherwise) in the consent gate so
 * every server-side capture honors the user's banner choice.
 *
 * The `safeAfter` callback passed into the adapter is what actually
 * makes server captures reach PostHog on Vercel. `posthog-node`
 * enqueues the capture in an in-memory buffer and flushes
 * asynchronously; without `after(promise)` the serverless function
 * returns and freezes before the HTTP request to PostHog completes,
 * silently dropping every event. The `ConsentGatedAnalytics`
 * decorator above wraps its own consent-check + forward in
 * `safeAfter` too, so the full async chain stays inside the request
 * lifetime.
 *
 * One instance per serverless container — PostHog's `flushAt: 1` is
 * still in effect, so reuse is safe.
 */
export const analytics: AnalyticsPort = new ConsentGatedAnalytics(analyticsFromEnv(safeAfter));
