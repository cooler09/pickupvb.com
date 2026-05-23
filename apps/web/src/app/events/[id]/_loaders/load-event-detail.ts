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
  captain_id: string;
  payment_status: 'none' | 'pending' | 'paid' | 'refunded';
  payment_intent_id: string | null;
  amount_paid_cents: number | null;
  captain: { id: string; display_name: string | null } | null;
  members: AdHocMemberRow[] | null;
};

function loadAdHocRowsCached(eventId: string): Promise<AdHocRegRow[]> {
  // Viewer-independent: RLS on event_team_registrations is `using (true)`
  // and the snapshot is shared across viewers, so use the admin client.
  // Critically, `getServerSupabase()` reads `cookies()` which Next 16
  // forbids inside `unstable_cache` — the lookup would throw and the
  // page would render an empty registrations list, hiding teams that
  // were just created.
  return unstable_cache(
    async () => {
      const { getAdminSupabase } = await import('@/lib/supabase-admin');
      const { data } = await getAdminSupabase()
        .from('event_team_registrations')
        .select(
          'id, name, division_id, captain_id, payment_status, payment_intent_id, amount_paid_cents, captain:profiles!event_team_registrations_captain_id_fkey(id, display_name), members:event_team_registration_members(id, user_id, display_name, email, sort_order)',
        )
        .eq('event_id', eventId);
      return (data as AdHocRegRow[] | null) ?? [];
    },
    ['event-ad-hoc-rows', eventId],
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

  const priceLabel = paid && breakdown ? `$${(breakdown.ticketCents / 100).toFixed(2)}` : 'Free';
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
    payments,
    viewerPaymentStatus,
    adHocViewerRegistrations: adHocBundle.viewerRegistrations,
    adHocAllRegistrations: adHocBundle.allRegistrations,
    adHocHostRows: adHocBundle.hostRows,
    attendeesForList,
    filledByPosition,
    viewerPosition,
    cta,
  };
}

// -----------------------------------------------------------------------------
// Side-load helpers
// -----------------------------------------------------------------------------

async function loadPrimaryHostSocialFresh(hostUserId: string): Promise<SocialHandles | null> {
  const sb = await getServerSupabase();
  const { data: socialRow } = await sb
    .from('profiles')
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
      .from('event_teams')
      .select('division_id, team_id, teams!inner(id, name)')
      .eq('event_id', event.id),
    sb.from('event_team_registrations').select('id, name, division_id').eq('event_id', event.id),
  ]);
  type RosterRow = {
    division_id: string;
    team_id: string;
    teams: { id: string; name: string } | null;
  };
  type RegOptionRow = { id: string; name: string; division_id: string };
  const map = new Map<string, EligibleTeamOption[]>();
  for (const r of (rosterRows as RosterRow[] | null) ?? []) {
    if (!r.teams || !r.division_id) continue;
    const arr = map.get(r.division_id) ?? [];
    arr.push({ kind: 'team', id: r.team_id, label: r.teams.name });
    map.set(r.division_id, arr);
  }
  for (const r of (regOptions as RegOptionRow[] | null) ?? []) {
    const arr = map.get(r.division_id) ?? [];
    arr.push({ kind: 'registration', id: r.id, label: r.name });
    map.set(r.division_id, arr);
  }
  for (const [k, v] of map) {
    v.sort((a, b) => a.label.localeCompare(b.label));
    map.set(k, v);
  }
  return map;
}

async function loadAdHocBundle(
  event: EventDetailReadModel,
  user: ViewerSession['user'] | null,
): Promise<AdHocBundle> {
  if (event.type !== 'tournament' || event.teamRegistrationMode !== 'ad_hoc') {
    return EMPTY_AD_HOC;
  }
  // Raw rows come from the cached helper above (viewer-independent). Per-
  // viewer projections (viewerRegistrations, hostRows, isViewerCaptain
  // flag) are derived here against the cached snapshot.
  const rows = await loadAdHocRowsCached(event.id);
  const allRegistrations: AdHocTeamPublicEntry[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    divisionId: r.division_id,
    paymentStatus: r.payment_status,
    memberCount: 1 + (r.members?.length ?? 0),
    isViewerCaptain: !!user && r.captain_id === user.id,
  }));
  const viewerRegistrations: AdHocTeamRegistration[] = user
    ? rows
        .filter((r) => r.captain_id === user.id)
        .map((r) => ({
          id: r.id,
          name: r.name,
          divisionId: r.division_id,
          paymentStatus: r.payment_status,
          members: (r.members ?? [])
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((m) => ({
              id: m.id,
              userId: m.user_id,
              displayName: m.display_name,
              email: m.email,
              sortOrder: m.sort_order,
            })),
        }))
    : [];
  const hostRows: HostAdHocTeamRow[] =
    event.canManage && rows.length > 0
      ? rows.map((r) => ({
          id: r.id,
          name: r.name,
          divisionId: r.division_id,
          paymentStatus: r.payment_status,
          paymentIntentId: r.payment_intent_id,
          amountPaidCents: r.amount_paid_cents ?? 0,
          rosterSize: 1 + (r.members?.length ?? 0),
          captain: {
            id: r.captain_id,
            displayName: r.captain?.display_name ?? null,
          },
        }))
      : [];
  return { viewerRegistrations, allRegistrations, hostRows };
}

async function loadAttendeePayments(eventId: string): Promise<Map<string, AttendeePaymentInfo>> {
  const { getAdminSupabase } = await import('@/lib/supabase-admin');
  const { data: payRows } = await getAdminSupabase()
    .from('event_attendees')
    .select('user_id, payment_status, payment_intent_id')
    .eq('event_id', eventId);
  type PayRow = {
    user_id: string;
    payment_status: string;
    payment_intent_id: string | null;
  };
  const map = new Map<string, AttendeePaymentInfo>();
  for (const r of (payRows as PayRow[] | null) ?? []) {
    map.set(r.user_id, {
      status: r.payment_status,
      viaStripe: !!r.payment_intent_id,
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
    .from('event_attendees')
    .select('payment_status')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle();
  const raw = (row as { payment_status?: string } | null)?.payment_status;
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
