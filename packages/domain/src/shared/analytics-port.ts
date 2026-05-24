/**
 * Analytics port + typed event taxonomy.
 *
 * Why this lives in `domain/shared`:
 *  - The event taxonomy is part of the product contract, not a vendor
 *    detail. Domain + application call `AnalyticsPort.capture(...)`
 *    without depending on the PostHog SDK (or any HTTP client). The
 *    PostHog adapter lives in `@pickupvb/infrastructure`.
 *
 * Discipline this file enforces:
 *  - **No free-form events.** Adding a new event means adding a new
 *    variant to `AnalyticsEvent`. The compiler then forces every
 *    adapter to handle it.
 *  - **No PII in props.** Every prop in this file is either an opaque
 *    id, a coarse enum, or a numeric metric. Email, display name,
 *    phone, and full addresses are intentionally absent. Adapters
 *    hash actor ids before they cross the network — see
 *    `posthog-analytics.ts` in infrastructure.
 *  - **Privacy guardrails are adapter-level**, not type-level: GPC/DNT,
 *    consent cookie, salt rotation. See docs/audits/analytics.md.
 */

/**
 * Opaque user id supplied by the caller (typically a Supabase user id).
 * Adapters hash this before any network call — never persist or log
 * the raw value as a distinct id.
 */
export type AnalyticsActorId = string;

/** Coarse event-type axis matching `EventType` but kept loose here to
 * avoid a circular dependency with the events aggregate. */
export type AnalyticsEventType = 'open_play' | 'tournament';

/** Common props attached to every event-scoped capture. Kept narrow so
 * the same set powers all funnels. */
export interface EventScopedProps {
  eventId: string;
  hostId: AnalyticsActorId;
  eventType: AnalyticsEventType;
  /** True when the event uses positional sign-up
   * (open-play + position roster configured). */
  byPosition: boolean;
  /** Ticket price in cents (0 = free). */
  priceCents: number;
  /** Opaque metro/region key if the event has one resolved. */
  metroId: string | null;
}

export interface EventPublishedProps extends EventScopedProps {
  /** Total configured capacity, or null for unlimited. */
  capacity: number | null;
}

export interface EventJoinedProps extends EventScopedProps {
  /** True when the join landed on the waitlist (over-capacity position
   * or capacity exceeded). */
  waitlist: boolean;
  /** Position the user signed up for, when positional. */
  position: string | null;
}

export type EventActorProps = EventScopedProps;

export interface CheckoutProps {
  eventId: string;
  hostId: AnalyticsActorId;
  amountCents: number;
  /** `ticket` | `team` | `tip` | `sponsor_slot` — the payment surface. */
  kind: 'ticket' | 'team' | 'tip' | 'sponsor_slot';
}

export interface CheckoutCompletedProps extends CheckoutProps {
  paymentIntentId: string;
}

export interface SignupCompletedProps {
  method: 'email' | 'oauth' | 'anon_claim';
}

export interface HostPayoutSetupCompletedProps {
  hostId: AnalyticsActorId;
}

/** Core Web Vitals + a couple of supporting paint/network metrics. The
 * names mirror the lowercase metric ids the browser exposes through
 * `next/web-vitals`. */
export type WebVitalMetric = 'LCP' | 'CLS' | 'INP' | 'FCP' | 'TTFB' | 'FID';

export interface WebVitalsProps {
  /** Which metric this sample is for. */
  metric: WebVitalMetric;
  /** Numeric value in metric-native units (ms for timing metrics,
   * unitless score for CLS). Rounded to the nearest integer for
   * timing metrics and to four decimals for CLS by the client
   * before being sent. */
  value: number;
  /** Google's `good` / `needs-improvement` / `poor` bucket if the
   * browser provided one. */
  rating: 'good' | 'needs-improvement' | 'poor' | null;
  /** Pathname the sample was collected on (no query string, no
   * fragment, no PII). Dynamic segments are template-style:
   * `/events/[id]` rather than `/events/abc-123`. */
  route: string;
  /** Page-load navigation type: `navigate` | `reload` | `back-forward`
   * | `prerender` | `restore`. Null when the browser doesn't expose it. */
  navigationType: string | null;
}

/**
 * Discriminated union of every event the platform captures. Add new
 * variants here before instrumenting a call site.
 */
export type AnalyticsEvent =
  | { name: 'event_published'; props: EventPublishedProps }
  | { name: 'event_joined'; props: EventJoinedProps }
  | { name: 'event_left'; props: EventActorProps }
  | { name: 'checkout_started'; props: CheckoutProps }
  | { name: 'checkout_completed'; props: CheckoutCompletedProps }
  | { name: 'signup_completed'; props: SignupCompletedProps }
  | { name: 'host_payout_setup_completed'; props: HostPayoutSetupCompletedProps }
  | { name: 'web_vitals'; props: WebVitalsProps };

export type AnalyticsEventName = AnalyticsEvent['name'];

/** Allowlisted traits set on `identify`. No PII. */
export interface AnalyticsTraits {
  metroId?: string | null;
  skillTier?: string | null;
  accountAgeDays?: number;
  /** Whether the actor is currently signed in via anonymous auth. */
  isAnonymous?: boolean;
  /** First-touch marketing attribution. Mirrors the four `utm_*`
   * dimensions PostHog displays natively. Captured at signup from
   * the `pickupvb_attr` cookie; never overwritten on subsequent
   * `identify` calls (per docs/audits/analytics.md P1 #3). */
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}

/**
 * Out-port for capturing typed product-analytics events. Implementations
 * must:
 *  - Never throw (fail-open: analytics must not break a request).
 *  - Hash `actorId` before any network call.
 *  - Respect Sec-GPC / DNT / consent cookie at the adapter boundary.
 *  - Provide a noop fallback when the vendor is unconfigured.
 */
export interface AnalyticsPort {
  /** Attach allowlisted traits to an actor. Safe to call repeatedly. */
  identify(actorId: AnalyticsActorId, traits: AnalyticsTraits): void;
  /** Capture a typed event. `actorId` is omitted for anonymous capture. */
  capture(event: AnalyticsEvent, actorId?: AnalyticsActorId): void;
  /** Flush + close any buffered events. Call from serverless `finally`
   * blocks so events reach the vendor before the function freezes. */
  shutdown(): Promise<void>;
}
