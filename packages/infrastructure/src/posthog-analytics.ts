import { createHash } from 'node:crypto';
import { PostHog } from 'posthog-node';
import type {
  AnalyticsActorId,
  AnalyticsEvent,
  AnalyticsPort,
  AnalyticsTraits,
} from '@pickupvb/domain';
import { NoopAnalytics } from './noop-analytics';

/**
 * PostHog server-side adapter for `AnalyticsPort`.
 *
 * Privacy contract (enforced here, not at the port):
 *  - Actor ids are sha256-hashed with `POSTHOG_DISTINCT_ID_SALT` before
 *    any network call. The raw Supabase user id never leaves the
 *    process.
 *  - Traits passed to `identify` are forwarded verbatim — callers are
 *    responsible for keeping them PII-free (the `AnalyticsTraits` type
 *    in `@pickupvb/domain` is already an allowlist of safe fields).
 *  - All errors are swallowed and logged via `console.warn`. Analytics
 *    must never propagate an exception into the request.
 *
 * Construction:
 *  - `apiKey` — PostHog **project API key** (write-only; safe on the
 *    server). Get it from PostHog → Project Settings → API.
 *  - `host` — PostHog ingest URL. Defaults to `https://us.i.posthog.com`;
 *    set to `https://eu.i.posthog.com` for EU hosting.
 *  - `salt` — secret used to derive the distinct id. Rotating it
 *    re-anonymizes existing users (intentional; see audit P3 #10).
 *  - `waitUntil` — optional callback that extends the lifetime of a
 *    serverless invocation until a background promise resolves. On
 *    Vercel this is `(p) => after(p)` from `next/server` — without it,
 *    `posthog-node` enqueues the capture but the lambda freezes before
 *    the HTTP request to PostHog completes, and the event is silently
 *    dropped. Omit for non-serverless or non-request contexts.
 *
 * Use `analyticsFromEnv()` below to construct from environment variables
 * with a `NoopAnalytics` fallback when unconfigured.
 */
export class PostHogAnalytics implements AnalyticsPort {
  private readonly client: PostHog;
  private readonly salt: string;

  constructor(
    apiKey: string,
    host: string,
    salt: string,
    waitUntil?: (promise: Promise<unknown>) => void,
  ) {
    this.client = new PostHog(apiKey, {
      host,
      // Server-side capture: flush aggressively so events reach PostHog
      // before a serverless function freezes. `shutdown()` is the
      // belt-and-braces flush for callers that can await; `waitUntil`
      // is the per-capture extension that actually keeps the lambda
      // alive long enough for the HTTP flush to land.
      flushAt: 1,
      flushInterval: 0,
      ...(waitUntil ? { waitUntil } : {}),
    });
    this.salt = salt;
  }

  private hash(actorId: AnalyticsActorId): string {
    return createHash('sha256').update(`${this.salt}:${actorId}`).digest('hex');
  }

  identify(actorId: AnalyticsActorId, traits: AnalyticsTraits): void {
    try {
      this.client.identify({
        distinctId: this.hash(actorId),
        properties: { ...traits },
      });
    } catch (err) {
      console.warn('[analytics] identify failed', err);
    }
  }

  capture(event: AnalyticsEvent, actorId?: AnalyticsActorId): void {
    try {
      this.client.capture({
        distinctId: actorId ? this.hash(actorId) : 'anonymous',
        event: event.name,
        properties: { ...event.props },
      });
    } catch (err) {
      console.warn('[analytics] capture failed', err);
    }
  }

  async shutdown(): Promise<void> {
    try {
      await this.client.shutdown();
    } catch (err) {
      console.warn('[analytics] shutdown failed', err);
    }
  }
}

/**
 * Resolve the analytics adapter from environment variables. Returns a
 * `NoopAnalytics` instance when any required variable is missing — this
 * is the expected state in local dev and CI.
 *
 * Required for PostHog:
 *  - `POSTHOG_API_KEY` — project API key (write-only)
 *  - `POSTHOG_DISTINCT_ID_SALT` — secret used to hash actor ids
 *
 * Optional:
 *  - `POSTHOG_HOST` — defaults to `https://us.i.posthog.com`
 *
 * @param waitUntil — optional Vercel `waitUntil`-shaped callback. See
 *   the `PostHogAnalytics` constructor for why this matters on
 *   serverless.
 */
export function analyticsFromEnv(waitUntil?: (promise: Promise<unknown>) => void): AnalyticsPort {
  const apiKey = process.env.POSTHOG_API_KEY;
  const salt = process.env.POSTHOG_DISTINCT_ID_SALT;
  if (!apiKey || !salt) {
    return new NoopAnalytics();
  }
  const host = process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com';
  return new PostHogAnalytics(apiKey, host, salt, waitUntil);
}
