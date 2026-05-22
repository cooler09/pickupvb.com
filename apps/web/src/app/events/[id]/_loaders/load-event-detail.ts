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
    event = await handlers.getEventDetail.execute(new GetEventDetailQuery(id, user?.id ?? null));
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
  // `paid`. Up to 6 RTTs in parallel.
  const [
    pricing,
    viewerIsPro,
    tipTotalCents,
    primaryHostUserSocial,
    eligibleTeamsByDivision,
    adHocBundle,
  ] = await Promise.all([
    getEventPricing(event.id),
    event.canManage && user
      ? (async () => (await import('@/lib/admin')).hasProBenefits(user.id))()
      : Promise.resolve(false),
    isHostOfEvent
      ? Promise.resolve(0)
      : (async () => {
          const { getAdminSupabase } = await import('@/lib/supabase-admin');
          const { data: tipTotal } = await getAdminSupabase().rpc('event_tip_total_cents', {
            p_event_id: event.id,
          } as never);
          return Number(tipTotal ?? 0);
        })(),
    loadPrimaryHostSocial(event),
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

  const filledByPosition: Partial<Record<string, number>> = {};
  for (const a of event.attendees) {
    if (!a.position) continue;
    filledByPosition[a.position] = (filledByPosition[a.position] ?? 0) + 1;
  }
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

async function loadPrimaryHostSocial(event: EventDetailReadModel): Promise<SocialHandles | null> {
  if (!event.primaryHostUser) return null;
  const sb = await getServerSupabase();
  const { data: socialRow } = await sb
    .from('profiles')
    .select(
      'instagram_handle, tiktok_handle, twitter_handle, facebook_handle, youtube_handle, website_url',
    )
    .eq('id', event.primaryHostUser.id)
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
  const sb = await getServerSupabase();
  const { data: regRows } = await sb
    .from('event_team_registrations')
    .select(
      'id, name, division_id, captain_id, payment_status, payment_intent_id, amount_paid_cents, captain:profiles!event_team_registrations_captain_id_fkey(id, display_name), members:event_team_registration_members(id, user_id, display_name, email, sort_order)',
    )
    .eq('event_id', event.id);
  type MemberRow = {
    id: string;
    user_id: string | null;
    display_name: string | null;
    email: string | null;
    sort_order: number;
  };
  type RegRow = {
    id: string;
    name: string;
    division_id: string;
    captain_id: string;
    payment_status: 'none' | 'pending' | 'paid' | 'refunded';
    payment_intent_id: string | null;
    amount_paid_cents: number | null;
    captain: { id: string; display_name: string | null } | null;
    members: MemberRow[] | null;
  };
  const rows: RegRow[] = (regRows as RegRow[] | null) ?? [];
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
