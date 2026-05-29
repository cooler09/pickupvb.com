/**
 * Page-level data loader for `/events/[id]`. Pulls the domain read model from
 * `GetEventDetailHandler` and runs every page-only side-load (pricing,
 * social handles, ad-hoc registrations, payment status, etc.) in two
 * parallel waves, then derives the bits the JSX needs (CTA, position-fill
 * counts, attendee list shape).
 *
 * The page itself is a thin renderer over `EventDetailViewModel` — see
 * the audit at docs/audits/architecture.md (P1: Event detail page diet).
 */
import { notFound } from 'next/navigation';
import { unstable_cache } from 'next/cache';
import type { Route } from 'next';
import { GetEventDetailQuery } from '@pickupvb/application';
import { NotFoundError, type EventDetailReadModel, type EventPosition } from '@pickupvb/domain';
import { SupabaseProfileRepository } from '@pickupvb/infrastructure';
import { handlers } from '@/lib/handlers';
import type { ViewerSession } from '@/lib/server-auth';
import { isAnonymousUser } from '@/lib/server-auth';
import { getServerSupabase } from '@/lib/supabase';
import { renderNowMs } from '@/lib/render-now';
import {
  getEventPricing,
  attendeeChargeBreakdownAsync,
  isPaidEvent,
  type EventPricing,
} from '@/lib/event-pricing';
import { PRICE_UNIT_LABEL } from '@/lib/enum-labels';
import type { SocialHandles } from '@/lib/social-handles';
import type { EventHeroCta } from '../_components/event-hero';
import type {
  AdHocTeamPublicEntry,
  AdHocTeamRegistration,
} from '../_components/ad-hoc-team-signup-panel';
import type { HostAdHocTeamRow } from '../_components/host-ad-hoc-teams-panel';

export type EligibleTeamOption = {
  kind: 'team' | 'registration';
  id: string;
  label: string;
};

export type LeagueTeamView = {
  teamId: string;
  name: string;
  forfeitedAt: Date | null;
};

/**
 * Hero price chip label for a multi-division event. Per the rule in
 * AGENTS.md (Patterns surfaced by audits — multi-division pricing):
 *
 * - all free                                  → `Free`
 * - all paid the same with one shared unit    → `$X.XX per team`
 * - mixed prices, all paid, one shared unit   → `From $X.XX per team`
 * - mixed prices, all paid, mixed units       → `From $X.XX`
 * - mix of free + paid                        → `From $X.XX [unit?]`
 *   (uses the cheapest non-zero floor; the free option is surfaced in
 *   the per-division section below the hero)
 *
 * Single-division events bypass this and use the resolved
 * `breakdown.ticketCents` so the chip matches what checkout charges.
 */
function multiDivisionPriceLabel(
  divisions: ReadonlyArray<{ priceCents: number | null; priceUnit: string }>,
): string {
  if (divisions.length === 0) return 'Free';
  const prices = divisions.map((d) => d.priceCents ?? 0);
  if (prices.every((c) => c === 0)) return 'Free';
  const paidPrices = prices.filter((c) => c > 0);
  const min = Math.min(...paidPrices);
  const max = Math.max(...paidPrices);
  const paidUnits = new Set(
    divisions.filter((d) => (d.priceCents ?? 0) > 0).map((d) => d.priceUnit),
  );
  const unitLabel =
    paidUnits.size === 1 ? ` ${PRICE_UNIT_LABEL[[...paidUnits][0]!] ?? ''}`.trimEnd() : '';
  const hasFree = prices.some((c) => c === 0);
  const allPaidSame = min === max && !hasFree;
  const prefix = allPaidSame ? '' : 'From ';
  return `${prefix}$${(min / 100).toFixed(2)}${unitLabel}`;
}

export type AttendeeListRow = {
  user_id: string;
  joined_at: string;
  position: EventPosition | null;
  waitlist: boolean;
  handle: string | null;
  profiles: {
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  };
};

export type AttendeePaymentInfo = {
  status: string;
  viaStripe: boolean;
};

export type ViewerPaymentStatus = 'paid' | 'pending' | 'none';

export type EventSponsorView = {
  name: string;
  blurb: string | null;
  linkUrl: string | null;
  logoUrl: string | null;
  discountCode: string | null;
};

export type EventDetailViewModel = {
  event: EventDetailReadModel;
  user: ViewerSession['user'] | null;
  isRealUser: boolean;
  isHostOfEvent: boolean;
  friendIds: Set<string>;
  returnPath: string;

  // Time-derived flags. Computed once at render time so the JSX doesn't
  // sprinkle `Date.now()` reads (would break the React Compiler).
  nowMs: number;
  hasStarted: boolean;
  closingSoon: boolean;
  isExternal: boolean;
  signupsOpen: boolean;

  // Pricing.
  pricing: EventPricing | null;
  paid: boolean;
  breakdown: {
    ticketCents: number;
    platformFeeCents: number;
    processingFeeCents: number;
    totalCents: number;
  } | null;
  priceLabel: string;

  // Side-loaded extras.
  viewerIsPro: boolean;
  tipTotalCents: number;
  /**
   * True when the primary host has a Stripe Connect account with
   * `charges_enabled`. Used to gate any on-platform payment CTA — tip
   * jar, ticket checkout, team checkout, etc. If false the UI should
   * fall back to off-platform copy ("pay the host") and not surface a
   * Stripe button that would only fail at checkout time.
   */
  hostStripeReady: boolean;
  primaryHostUserSocial: SocialHandles | null;
  eligibleTeamsByDivision: ReadonlyMap<string, EligibleTeamOption[]>;
  /**
   * Per-division roster for league events the viewer can manage. Empty
   * map for non-league events or non-hosts. Used by the host-tools
   * "League teams" panel to surface forfeit / reinstate controls.
   */
  leagueTeamsByDivision: ReadonlyMap<string, LeagueTeamView[]>;
  payments: Map<string, AttendeePaymentInfo> | undefined;
  viewerPaymentStatus: ViewerPaymentStatus | undefined;

  // Ad-hoc tournament registrations.
  adHocViewerRegistrations: ReadonlyArray<AdHocTeamRegistration>;
  adHocAllRegistrations: ReadonlyArray<AdHocTeamPublicEntry>;
  adHocHostRows: ReadonlyArray<HostAdHocTeamRow>;

  // Attendee-list bridge (legacy snake_case shape).
  attendeesForList: AttendeeListRow[];
  filledByPosition: Partial<Record<string, number>>;
  viewerPosition: EventPosition | null;

  // Optional host-owned sponsor block (Bundle 84).
  sponsor: EventSponsorView | null;

  // Wide banner image uploaded by the host (nullable — fallback gradient shown).
  heroImageUrl: string | null;

  // Hero / sticky call-to-action.
  cta: EventHeroCta;
};

type AdHocBundle = {
  viewerRegistrations: ReadonlyArray<AdHocTeamRegistration>;
  allRegistrations: ReadonlyArray<AdHocTeamPublicEntry>;
  hostRows: ReadonlyArray<HostAdHocTeamRow>;
};

const EMPTY_AD_HOC: AdHocBundle = {
  viewerRegistrations: [],
  allRegistrations: [],
  hostRows: [],
};

// -----------------------------------------------------------------------------
// Cached viewer-independent side-loads (Bundle 26)
// -----------------------------------------------------------------------------
//
// The event-detail read model + a handful of side-loads (pricing, primary
// host socials, tip total, ad-hoc team registrations) are identical for
// every visitor. The infrastructure repository runs on the admin client
// so RLS doesn't vary by caller — safe to share results across requests.
//
// We wrap each in `unstable_cache` keyed on the event id with a 60s
// revalidate window — matches the ISR cadence on sibling detail pages
// (/teams/[id], /groups/[id], /players/[id]). For anonymous viewers
// (SEO crawlers, link clicks, logged-out browsing) the entire detail
// page can be served without a single Supabase round-trip on warm cache.
// Signed-in viewers still hit DB for the viewer-aware read-model copy,
// but skip the side-loads listed below.
//
// Cache tags: `event:{id}`. Mutating actions can call
// `revalidateTag('event:{id}')` to evict on demand; otherwise the 60s
// window covers all currently-acceptable staleness budgets.

/**
 * Cached event-detail read model with `viewerId = null` — i.e. the
 * public, anonymous view. Used directly for anonymous viewers and from
 * `generateMetadata`. Throws `NotFoundError` if the event doesn't exist.
 *
 * `unstable_cache` JSON-serializes its return value, so every `Date` in
 * the read model comes back as an ISO string on a cache hit (and even on
 * the first miss — Next re-parses the JSON it just wrote). We revive the
 * known date fields before handing the model to callers, otherwise the
 * page crashes with `startsAt.getTime is not a function` for logged-out
 * viewers (logged-in viewers skip this cache entirely and keep native
 * `Date` objects, which is why the bug was anonymous-only).
 */
export async function loadEventReadModelPublic(id: string): Promise<EventDetailReadModel> {
  const cached = await unstable_cache(
    async () => handlers.getEventDetail.execute(new GetEventDetailQuery(id, null)),
    ['event-detail-public', id],
    { revalidate: 60, tags: [`event:${id}`] },
  )();
  return reviveEventDetailDates(cached);
}

/** Re-hydrate every `Date` field that `unstable_cache` flattened to a string. */
function reviveEventDetailDates(m: EventDetailReadModel): EventDetailReadModel {
  const toDate = (v: unknown): Date => new Date(v as string);
  const toDateOrNull = (v: unknown): Date | null => (v == null ? null : new Date(v as string));
  return {
    ...m,
    startsAt: toDate(m.startsAt),
    endsAt: toDate(m.endsAt),
    registrationClosesAt: toDateOrNull(m.registrationClosesAt),
    attendees: m.attendees.map((a) => ({ ...a, joinedAt: toDate(a.joinedAt) })),
    freeAgents: m.freeAgents.map((f) => ({ ...f, joinedAt: toDate(f.joinedAt) })),
    divisions: m.divisions.map((d) => ({
      ...d,
      startsAt: toDateOrNull(d.startsAt),
      endsAt: toDateOrNull(d.endsAt),
      winner: d.winner ? { ...d.winner, recordedAt: toDate(d.winner.recordedAt) } : null,
    })),
  };
}

function loadEventPricingCached(id: string): Promise<EventPricing | null> {
  return unstable_cache(async () => getEventPricing(id), ['event-pricing', id], {
    revalidate: 60,
    tags: [`event:${id}`],
  })();
}

function loadEventTipTotalCached(id: string): Promise<number> {
  return unstable_cache(
    async () => {
      const { getAdminSupabase } = await import('@/lib/supabase-admin');
      const { data } = await getAdminSupabase().rpc('event_tip_total_cents', {
        p_event_id: id,
      } as never);
      return Number(data ?? 0);
    },
    ['event-tip-total', id],
    { revalidate: 60, tags: [`event:${id}`] },
  )();
}

function loadPrimaryHostSocialCached(hostUserId: string): Promise<SocialHandles | null> {
  return unstable_cache(
    async () => loadPrimaryHostSocialFresh(hostUserId),
    ['profile-social', hostUserId],
    { revalidate: 300, tags: [`profile:${hostUserId}`] },
  )();
}

/**
 * "Does the primary host have a Stripe account that can accept charges
 * right now?" — cached per-host with the same 5-minute window as the
 * social-handles loader. The host-stripe-account row only flips on
 * webhook callbacks from Stripe, so a 5-minute lag is acceptable.
 */
function loadHostStripeReadyCached(hostUserId: string): Promise<boolean> {
  return unstable_cache(
    async () => {
      const { getHostStripeAccount } = await import('@/lib/host-stripe-account');
      return (await getHostStripeAccount(hostUserId)) !== null;
    },
    ['host-can-collect', hostUserId],
    { revalidate: 300, tags: [`host-stripe:${hostUserId}`] },
  )();
}

type AdHocMemberRow = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  email: string | null;
  sort_order: number;
};

type AdHocRegRow = {
  id: string;
  name: string;
  division_id: string;
  captain_id: string | null;
  source: 'ad_hoc' | 'walk_in';
  captain_display_name: string | null;
  captain_phone: string | null;
  payment_status: 'none' | 'pending' | 'paid' | 'refunded';
  payment_intent_id: string | null;
  amount_paid_cents: number | null;
  payment_note: string | null;
  captain: { id: string; display_name: string | null } | null;
  members: AdHocMemberRow[] | null;
};

// Public-projection types — no email, no user_id.
type AdHocMemberPublicRow = {
  id: string;
  entry_id: string;
  display_name: string | null;
  sort_order: number;
};

type AdHocRegPublicRow = {
  id: string;
  name: string;
  division_id: string;
  captain_id: string | null;
  source: 'ad_hoc' | 'walk_in';
  payment_status: 'none' | 'pending' | 'paid' | 'refunded';
  captainDisplayName: string | null;
  members: AdHocMemberPublicRow[];
};

/**
 * Public cached snapshot — reads only from narrow public surfaces so
 * no PII (email, user_id) enters the shared cache.
 *
 * - Registrations from `event_team_registrations` (RLS: `using (true)`)
 * - Members from `event_team_registration_members_public` view
 *   (projects only `id, registration_id, display_name, sort_order`)
 * - Captain names from `profiles_public` view
 *
 * Used exclusively to build `allRegistrations` (the public-visible list).
 * Captain and host projections use `loadAdHocRowsCached` which carries
 * the full `email` / `user_id` payload for authorized callers only.
 */
function loadAdHocPublicRowsCached(eventId: string): Promise<AdHocRegPublicRow[]> {
  return unstable_cache(
    async () => {
      const { getAdminSupabase } = await import('@/lib/supabase-admin');
      const admin = getAdminSupabase();

      const { data: regData } = await admin
        .from('event_team_entries')
        .select(
          'id, display_name, division_id, captain_id, source, event_divisions!inner(event_id), payment:event_team_payments(payment_status)',
        )
        .eq('event_divisions.event_id', eventId)
        .neq('source', 'roster')
        .is('deleted_at', null);
      type RegBase = {
        id: string;
        display_name: string;
        division_id: string;
        captain_id: string | null;
        source: 'ad_hoc' | 'walk_in';
        payment:
          | { payment_status: 'none' | 'pending' | 'paid' | 'refunded' }
          | Array<{ payment_status: 'none' | 'pending' | 'paid' | 'refunded' }>
          | null;
      };
      const rawRegs = (regData as RegBase[] | null) ?? [];
      const regs = rawRegs.map((r) => {
        const p = Array.isArray(r.payment) ? r.payment[0] : r.payment;
        return {
          id: r.id,
          display_name: r.display_name,
          division_id: r.division_id,
          captain_id: r.captain_id,
          source: r.source,
          payment_status: (p?.payment_status ?? 'none') as 'none' | 'pending' | 'paid' | 'refunded',
        };
      });
      if (regs.length === 0) return [];

      const regIds = regs.map((r) => r.id);
      const captainIds = [
        ...new Set(regs.map((r) => r.captain_id).filter((id): id is string => !!id)),
      ];

      const [{ data: memberData }, captainCards] = await Promise.all([
        admin
          .from('event_team_entry_members_public')
          .select('id, entry_id, display_name, sort_order')
          .in('entry_id', regIds),
        // Captain display names via the ProfileQueries port (admin client —
        // safe inside unstable_cache, no cookies).
        new SupabaseProfileRepository(admin).findCardsByIds(captainIds),
      ]);

      const membersByReg = new Map<string, AdHocMemberPublicRow[]>();
      for (const m of (memberData as AdHocMemberPublicRow[] | null) ?? []) {
        const arr = membersByReg.get(m.entry_id) ?? [];
        arr.push(m);
        membersByReg.set(m.entry_id, arr);
      }

      return regs.map((r) => ({
        id: r.id,
        name: r.display_name,
        division_id: r.division_id,
        captain_id: r.captain_id,
        source: r.source,
        payment_status: r.payment_status,
        // Walk-ins (captain_id = null) carry their captain's name on the
        // entry's display_name; for ad-hoc, fall back to the linked profile.
        captainDisplayName:
          r.captain_id === null
            ? r.display_name
            : (captainCards.get(r.captain_id)?.displayName ?? null),
        members: (membersByReg.get(r.id) ?? []).sort((a, b) => a.sort_order - b.sort_order),
      }));
    },
    ['event-ad-hoc-public-rows', eventId],
    { revalidate: 60, tags: [`event:${eventId}`] },
  )();
}

/**
 * Private cached snapshot — includes `email` and `user_id` for each
 * member. Only fetched when the viewer is signed in (captain) or is
 * managing the event (host). Never used for the public `allRegistrations`
 * projection.
 */
function loadAdHocRowsCached(eventId: string): Promise<AdHocRegRow[]> {
  // Viewer-independent; admin client bypasses RLS and is safe inside
  // unstable_cache (no cookies() lookup).
  return unstable_cache(
    async () => {
      const { getAdminSupabase } = await import('@/lib/supabase-admin');
      const { data } = await getAdminSupabase()
        .from('event_team_entries')
        .select(
          'id, display_name, division_id, captain_id, source, captain_display_name, captain_phone, captain:profiles!event_team_entries_captain_id_fkey(id, display_name), members:event_team_entry_members(id, user_id, display_name, email, sort_order), payment:event_team_payments(payment_status, payment_intent_id, amount_paid_cents, payment_note), event_divisions!inner(event_id)',
        )
        .eq('event_divisions.event_id', eventId)
        .neq('source', 'roster')
        .is('deleted_at', null);
      type PaymentEmbed = {
        payment_status: 'none' | 'pending' | 'paid' | 'refunded';
        payment_intent_id: string | null;
        amount_paid_cents: number | null;
        payment_note: string | null;
      };
      type Raw = {
        id: string;
        display_name: string;
        division_id: string;
        captain_id: string | null;
        source: 'ad_hoc' | 'walk_in';
        captain_display_name: string | null;
        captain_phone: string | null;
        captain: { id: string; display_name: string | null } | null;
        members: AdHocMemberRow[] | null;
        payment: PaymentEmbed | PaymentEmbed[] | null;
      };
      const raw = (data as Raw[] | null) ?? [];
      return raw.map((r) => {
        const p = Array.isArray(r.payment) ? r.payment[0] : r.payment;
        return {
          id: r.id,
          name: r.display_name,
          division_id: r.division_id,
          captain_id: r.captain_id,
          source: r.source,
          captain_display_name: r.captain_display_name,
          captain_phone: r.captain_phone,
          payment_status: p?.payment_status ?? 'none',
          payment_intent_id: p?.payment_intent_id ?? null,
          amount_paid_cents: p?.amount_paid_cents ?? null,
          payment_note: p?.payment_note ?? null,
          captain: r.captain,
          members: r.members,
        };
      });
    },
    ['event-ad-hoc-rows', eventId],
    { revalidate: 60, tags: [`event:${eventId}`] },
  )();
}

function loadHeroImageCached(eventId: string): Promise<string | null> {
  return unstable_cache(
    async () => {
      const { getAdminSupabase } = await import('@/lib/supabase-admin');
      const { data } = await getAdminSupabase()
        .from('events')
        .select('hero_image_url')
        .eq('id', eventId)
        .maybeSingle();
      return (data as { hero_image_url: string | null } | null)?.hero_image_url ?? null;
    },
    ['event-hero-image', eventId],
    { revalidate: 60, tags: [`event:${eventId}`] },
  )();
}

function loadEventSponsorCached(eventId: string): Promise<EventSponsorView | null> {
  return unstable_cache(
    async () => {
      const { getAdminSupabase } = await import('@/lib/supabase-admin');
      const { data } = await getAdminSupabase()
        .from('event_sponsors')
        .select('name, blurb, link_url, logo_url, discount_code')
        .eq('event_id', eventId)
        .maybeSingle();

      if (!data) return null;
      return {
        name: data.name,
        blurb: data.blurb,
        linkUrl: data.link_url,
        logoUrl: data.logo_url,
        discountCode: data.discount_code,
      };
    },
    ['event-sponsor', eventId],
    { revalidate: 60, tags: [`event:${eventId}`] },
  )();
}

/**
 * Load and hydrate the full event detail view model. Calls `notFound()`
 * when the event doesn't exist; other domain errors propagate.
 */
export async function loadEventDetail(
  id: string,
  viewer: ViewerSession | null,
): Promise<EventDetailViewModel> {
  const user = viewer?.user ?? null;
  const isRealUser = !!user && !isAnonymousUser(user);

  let event: EventDetailReadModel;
  try {
    event = user
      ? await handlers.getEventDetail.execute(new GetEventDetailQuery(id, user.id))
      : await loadEventReadModelPublic(id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const friendIds = new Set(event.viewerFriendIds);
  const returnPath = `/events/${event.id}`;
  const nowMs = renderNowMs();
  const hasStarted = event.startsAt.getTime() <= nowMs;
  const closesAtMs = event.registrationClosesAt ? event.registrationClosesAt.getTime() : null;
  const closingSoon =
    closesAtMs !== null && closesAtMs > nowMs && closesAtMs - nowMs <= 72 * 60 * 60 * 1000;
  const isExternal = event.registrationMode === 'external';
  const signupsOpen = event.status === 'published' && !hasStarted && !isExternal;
  const isHostOfEvent = !!user && event.canManage;

  // Wave 1 — every viewer/host/event side-load that doesn't depend on
  // `paid`. Up to 6 RTTs in parallel. Pricing / tip total / primary host
  // social / ad-hoc team rows are all viewer-independent and served via
  // `unstable_cache` (60s revalidate, `event:{id}` tag).
  const [
    pricing,
    viewerIsPro,
    tipTotalCents,
    primaryHostUserSocial,
    hostStripeReady,
    eligibleTeamsByDivision,
    adHocBundle,
    sponsor,
    heroImageUrl,
    leagueTeamsByDivision,
  ] = await Promise.all([
    loadEventPricingCached(event.id),
    event.canManage && user
      ? (async () => (await import('@/lib/admin')).hasProBenefits(user.id))()
      : Promise.resolve(false),
    isHostOfEvent ? Promise.resolve(0) : loadEventTipTotalCached(event.id),
    event.primaryHostUser
      ? loadPrimaryHostSocialCached(event.primaryHostUser.id)
      : Promise.resolve(null),
    // Always load — the flag now gates ticket / team Pay buttons too,
    // which the host can also see on their own event. The tip-jar
    // visibility separately gates on `!isHostOfEvent` at the render site.
    event.primaryHostUser
      ? loadHostStripeReadyCached(event.primaryHostUser.id)
      : Promise.resolve(false),
    loadEligibleTeamsByDivision(event),
    loadAdHocBundle(event, user),
    loadEventSponsorCached(event.id),
    loadHeroImageCached(event.id),
    loadLeagueTeamsByDivision(event),
  ]);

  const paid = isPaidEvent(pricing);
  const needsViewerPayment = paid && !!user && event.isAttending;
  const needsManagePayments = paid && event.canManage;

  // Wave 2 — paid-event-only side-loads.
  const [breakdown, payments, viewerPaymentStatus] = await Promise.all([
    pricing && paid ? attendeeChargeBreakdownAsync(pricing) : Promise.resolve(null),
    needsManagePayments ? loadAttendeePayments(event.id) : Promise.resolve(undefined),
    needsViewerPayment ? loadViewerPaymentStatus(event.id, user!.id) : Promise.resolve(undefined),
  ]);

  // Map the read model to the legacy snake_case shape AttendeeList expects.
  const attendeesForList: AttendeeListRow[] = event.attendees.map((a) => ({
    user_id: a.userId,
    joined_at: a.joinedAt.toISOString(),
    position: a.position,
    waitlist: a.waitlist,
    handle: a.profile.handle,
    profiles: {
      display_name: a.profile.displayName,
      first_name: a.profile.firstName,
      last_name: a.profile.lastName,
      avatar_url: a.profile.avatarUrl,
    },
  }));

  // Per-position fill counts (including waitlisted) come straight off
  // the read model — the infrastructure repository already maintains
  // the running count while computing waitlist flags, so there's no
  // need to re-walk attendees here.
  const filledByPosition = event.filledByPosition;
  const viewerPosition = user
    ? (event.attendees.find((a) => a.userId === user.id)?.position ?? null)
    : null;

  const priceLabel =
    event.divisions.length > 1
      ? multiDivisionPriceLabel(event.divisions)
      : paid && breakdown
        ? `$${(breakdown.ticketCents / 100).toFixed(2)}`
        : 'Free';
  const cta = buildCta({
    event,
    isExternal,
    signupsOpen,
    hasStarted,
    paid,
  });

  return {
    event,
    user,
    isRealUser,
    isHostOfEvent,
    friendIds,
    returnPath,
    nowMs,
    hasStarted,
    closingSoon,
    isExternal,
    signupsOpen,
    pricing,
    paid,
    breakdown,
    priceLabel,
    viewerIsPro,
    tipTotalCents,
    primaryHostUserSocial,
    hostStripeReady,
    eligibleTeamsByDivision,
    leagueTeamsByDivision,
    payments,
    viewerPaymentStatus,
    adHocViewerRegistrations: adHocBundle.viewerRegistrations,
    adHocAllRegistrations: adHocBundle.allRegistrations,
    adHocHostRows: adHocBundle.hostRows,
    attendeesForList,
    filledByPosition,
    viewerPosition,
    sponsor,
    heroImageUrl,
    cta,
  };
}

// -----------------------------------------------------------------------------
// Side-load helpers
// -----------------------------------------------------------------------------

async function loadPrimaryHostSocialFresh(hostUserId: string): Promise<SocialHandles | null> {
  const sb = await getServerSupabase();
  const { data: socialRow } = await sb
    .from('profiles_public')
    .select(
      'instagram_handle, tiktok_handle, twitter_handle, facebook_handle, youtube_handle, website_url',
    )
    .eq('id', hostUserId)
    .maybeSingle();
  const r = socialRow as {
    instagram_handle: string | null;
    tiktok_handle: string | null;
    twitter_handle: string | null;
    facebook_handle: string | null;
    youtube_handle: string | null;
    website_url: string | null;
  } | null;
  if (!r) return null;
  return {
    instagramHandle: r.instagram_handle,
    tiktokHandle: r.tiktok_handle,
    twitterHandle: r.twitter_handle,
    facebookHandle: r.facebook_handle,
    youtubeHandle: r.youtube_handle,
    websiteUrl: r.website_url,
  };
}

async function loadEligibleTeamsByDivision(
  event: EventDetailReadModel,
): Promise<Map<string, EligibleTeamOption[]>> {
  if (!event.canManage || event.type !== 'tournament' || event.divisions.length === 0) {
    return new Map<string, EligibleTeamOption[]>();
  }
  const sb = await getServerSupabase();
  const [{ data: rosterRows }, { data: regOptions }] = await Promise.all([
    sb
      .from('event_team_entries')
      .select(
        'division_id, team_id, teams!inner(id, name), division:event_divisions!inner(event_id)',
      )
      .eq('division.event_id', event.id)
      .eq('source', 'roster')
      .is('deleted_at', null),
    sb
      .from('event_team_entries')
      .select('id, display_name, division_id, event_divisions!inner(event_id)')
      .eq('event_divisions.event_id', event.id)
      .neq('source', 'roster')
      .is('deleted_at', null),
  ]);
  type RosterRow = {
    division_id: string;
    team_id: string | null;
    teams: { id: string; name: string } | null;
  };
  type RegOptionRow = { id: string; display_name: string; division_id: string };
  const map = new Map<string, EligibleTeamOption[]>();
  for (const r of (rosterRows as RosterRow[] | null) ?? []) {
    if (!r.teams || !r.division_id || !r.team_id) continue;
    const arr = map.get(r.division_id) ?? [];
    arr.push({ kind: 'team', id: r.team_id, label: r.teams.name });
    map.set(r.division_id, arr);
  }
  for (const r of (regOptions as RegOptionRow[] | null) ?? []) {
    const arr = map.get(r.division_id) ?? [];
    arr.push({ kind: 'registration', id: r.id, label: r.display_name });
    map.set(r.division_id, arr);
  }
  for (const [k, v] of map) {
    v.sort((a, b) => a.label.localeCompare(b.label));
    map.set(k, v);
  }
  return map;
}

async function loadLeagueTeamsByDivision(
  event: EventDetailReadModel,
): Promise<Map<string, LeagueTeamView[]>> {
  if (!event.canManage || event.type !== 'league' || event.divisions.length === 0) {
    return new Map<string, LeagueTeamView[]>();
  }
  const sb = await getServerSupabase();
  const { data: rows } = await sb
    .from('event_team_entries')
    .select(
      'division_id, team_id, forfeited_at, teams!inner(id, name), division:event_divisions!inner(event_id)',
    )
    .eq('division.event_id', event.id)
    .eq('source', 'roster')
    .is('deleted_at', null);
  type Row = {
    division_id: string;
    team_id: string | null;
    forfeited_at: string | null;
    teams: { id: string; name: string } | null;
  };
  const map = new Map<string, LeagueTeamView[]>();
  for (const r of (rows as Row[] | null) ?? []) {
    if (!r.teams || !r.team_id) continue;
    const arr = map.get(r.division_id) ?? [];
    arr.push({
      teamId: r.team_id,
      name: r.teams.name,
      forfeitedAt: r.forfeited_at ? new Date(r.forfeited_at) : null,
    });
    map.set(r.division_id, arr);
  }
  for (const [k, v] of map) {
    v.sort((a, b) => a.name.localeCompare(b.name));
    map.set(k, v);
  }
  return map;
}

async function loadAdHocBundle(
  event: EventDetailReadModel,
  user: ViewerSession['user'] | null,
): Promise<AdHocBundle> {
  if (
    event.type !== 'tournament' ||
    !event.divisions.some((d) => d.teamRegistrationMode === 'ad_hoc')
  ) {
    return EMPTY_AD_HOC;
  }

  // Public snapshot (no PII) is always needed for `allRegistrations`.
  // Private snapshot (email + user_id) is only needed when the viewer
  // is signed in (may be a captain) or is managing the event (host).
  const needsPrivate = !!user || event.canManage;
  const [publicRows, privateRows] = await Promise.all([
    loadAdHocPublicRowsCached(event.id),
    needsPrivate ? loadAdHocRowsCached(event.id) : Promise.resolve<AdHocRegRow[]>([]),
  ]);

  // Public projection — sourced exclusively from the narrow public cache.
  // Members are pre-sorted by sort_order in the loader.
  const allRegistrations: AdHocTeamPublicEntry[] = publicRows.map((r) => ({
    id: r.id,
    name: r.name,
    divisionId: r.division_id,
    paymentStatus: r.payment_status,
    source: r.source,
    captainName: r.captainDisplayName,
    members: r.members.map((m) => ({
      id: m.id,
      displayName: m.display_name ?? 'Player',
    })),
    isViewerCaptain: !!user && r.captain_id !== null && r.captain_id === user.id,
  }));

  // Captain and host projections — sourced from the private cache which
  // carries email and user_id. `sortedPrivateMembers` is only applied here.
  const sortedPrivateMembers = (r: AdHocRegRow): AdHocMemberRow[] =>
    (r.members ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);

  const viewerRegistrations: AdHocTeamRegistration[] = user
    ? privateRows
        .filter((r) => r.captain_id !== null && r.captain_id === user.id)
        .map((r) => ({
          id: r.id,
          name: r.name,
          divisionId: r.division_id,
          paymentStatus: r.payment_status,
          members: sortedPrivateMembers(r).map((m) => ({
            id: m.id,
            userId: m.user_id,
            displayName: m.display_name,
            email: m.email,
            sortOrder: m.sort_order,
          })),
        }))
    : [];

  const hostRows: HostAdHocTeamRow[] =
    event.canManage && privateRows.length > 0
      ? privateRows.map((r) => {
          // Walk-ins (captain_id null) carry their captain's identity in
          // `captain_display_name` (typed at the table by the host); for
          // ad-hoc / captain sources, fall back to the linked profile.
          const captainName =
            r.captain_id === null ? r.captain_display_name : (r.captain?.display_name ?? null);
          return {
            id: r.id,
            name: r.name,
            divisionId: r.division_id,
            paymentStatus: r.payment_status,
            paymentIntentId: r.payment_intent_id,
            amountPaidCents: r.amount_paid_cents ?? 0,
            rosterSize: 1 + (r.members?.length ?? 0),
            source: r.source,
            captainPhone: r.captain_phone,
            paymentNote: r.payment_note,
            captain: {
              id: r.captain_id,
              displayName: captainName,
            },
            members: sortedPrivateMembers(r).map((m) => ({
              id: m.id,
              userId: m.user_id,
              displayName: m.display_name ?? m.email ?? 'Player',
              email: m.email,
            })),
          };
        })
      : [];

  return { viewerRegistrations, allRegistrations, hostRows };
}

async function loadAttendeePayments(eventId: string): Promise<Map<string, AttendeePaymentInfo>> {
  const { getAdminSupabase } = await import('@/lib/supabase-admin');
  const { data: payRows } = await getAdminSupabase()
    .from('event_participants')
    .select(
      'user_id, payment:event_participant_payments(payment_status, payment_intent_id), division:event_divisions!inner(event_id)',
    )
    .eq('role', 'attendee')
    .eq('division.event_id', eventId);
  type PayRow = {
    user_id: string;
    payment: {
      payment_status: string;
      payment_intent_id: string | null;
    } | null;
  };
  const map = new Map<string, AttendeePaymentInfo>();
  for (const r of (payRows as PayRow[] | null) ?? []) {
    map.set(r.user_id, {
      status: r.payment?.payment_status ?? 'pending',
      viaStripe: !!r.payment?.payment_intent_id,
    });
  }
  return map;
}

async function loadViewerPaymentStatus(
  eventId: string,
  userId: string,
): Promise<ViewerPaymentStatus | undefined> {
  const sb = await getServerSupabase();
  const { data: row } = await sb
    .from('event_participants')
    .select(
      'payment:event_participant_payments(payment_status), division:event_divisions!inner(event_id)',
    )
    .eq('role', 'attendee')
    .eq('division.event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle();
  const raw = (row as { payment?: { payment_status?: string } | null } | null)?.payment
    ?.payment_status;
  return raw === 'paid' || raw === 'pending' || raw === 'none' ? raw : undefined;
}

// -----------------------------------------------------------------------------
// Hero CTA
// -----------------------------------------------------------------------------

function buildCta(args: {
  event: EventDetailReadModel;
  isExternal: boolean;
  signupsOpen: boolean;
  hasStarted: boolean;
  paid: boolean;
}): EventHeroCta {
  const { event, isExternal, signupsOpen, hasStarted, paid } = args;
  if (event.status === 'cancelled' || event.status === 'draft') return null;
  if (isExternal && signupsOpen && event.externalRegistrationUrl) {
    return {
      kind: 'external',
      href: event.externalRegistrationUrl,
      label: 'Register externally',
    };
  }
  if (event.type === 'tournament' && (hasStarted || event.status === 'completed')) {
    return {
      kind: 'internal',
      href: `/events/${event.id}/bracket` as Route,
      label: 'Open bracket',
    };
  }
  if (event.type === 'open_play' && (hasStarted || event.status === 'completed')) {
    return { kind: 'anchor', hash: '#attendees', label: 'View attendees' };
  }
  if (!signupsOpen) return null;
  if (event.isAttending) {
    return { kind: 'anchor', hash: '#signup', label: "You're in — view details" };
  }
  if (event.spotsRemaining === 0) {
    return { kind: 'anchor', hash: '#signup', label: 'Join waitlist' };
  }
  if (event.type === 'tournament') {
    return { kind: 'anchor', hash: '#signup', label: 'Register' };
  }
  if (paid) return { kind: 'anchor', hash: '#signup', label: 'Buy ticket' };
  return { kind: 'anchor', hash: '#signup', label: 'RSVP' };
}
