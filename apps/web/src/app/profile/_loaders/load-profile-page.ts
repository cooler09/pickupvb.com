import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server-auth';
import { POSITION_LABEL } from '@/lib/enum-labels';
import { relativeEventDay } from '@/lib/date-formats';
import { type EventCardData } from '../../events/_components/event-card';
import {
  SupabaseGroupQueryRepository,
  SupabaseSocialGraphRepository,
} from '@pickupvb/infrastructure';
import { loadVisibleHostedEvents } from '@/components/hosted-events-list';
import { type MyGroup } from '../_components/my-groups-section';
import { GetAttendingEventsQuery, ListProfileMediaQuery } from '@pickupvb/application';
import { getMediaHandlers, handlers } from '@/lib/handlers';
import { isPlatformAdmin } from '@/lib/admin';
import { isPro } from '@/lib/pro';
import { getHostStripeAccount } from '@/lib/host-stripe-account';
import { type ShelfBadge } from '@/components/badge-shelf';
import { reconcileUserBadges, getOwnBadges } from '@/lib/badges';
import { loadPlayerOnboarding, loadHostOnboarding } from '@/lib/onboarding';

const HOSTED_PER_PAGE = 8;
const FOLLOWING_PER_PAGE = 24;
// Rich event cards (thumbnails) — keep the per-page count modest.
const ATTENDING_PER_PAGE = 6;
// Videos are embedded players (iframes) — keep the per-page count low.
const VIDEOS_PER_PAGE = 6;

export const PROFILE_PAGE_SIZES = {
  hosted: HOSTED_PER_PAGE,
  following: FOLLOWING_PER_PAGE,
  attending: ATTENDING_PER_PAGE,
  videos: VIDEOS_PER_PAGE,
} as const;

type ProfileRow = {
  handle: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  home_city: string | null;
  avatar_url: string | null;
  auto_accept_team_invites: boolean | null;
  show_pro_badge: boolean | null;
  primary_position: string | null;
  secondary_position: string | null;
  tertiary_position: string | null;
  instagram_handle: string | null;
  tiktok_handle: string | null;
  twitter_handle: string | null;
  facebook_handle: string | null;
  youtube_handle: string | null;
  website_url: string | null;
};

export type ProfileView = {
  handle: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  home_city: string | null;
  avatar_url: string | null;
  auto_accept_team_invites: boolean;
  show_pro_badge: boolean;
  primary_position: string | null;
  secondary_position: string | null;
  tertiary_position: string | null;
  instagram_handle: string | null;
  tiktok_handle: string | null;
  twitter_handle: string | null;
  facebook_handle: string | null;
  youtube_handle: string | null;
  website_url: string | null;
};

type FriendEdges = Awaited<ReturnType<SupabaseSocialGraphRepository['getFriendEdges']>>;
type HostedEvents = Awaited<ReturnType<typeof loadVisibleHostedEvents>>;
type ProfileMedia = Awaited<
  ReturnType<Awaited<ReturnType<typeof getMediaHandlers>>['listProfileMedia']['execute']>
>;
type PlayerOnboarding = Awaited<ReturnType<typeof loadPlayerOnboarding>>;
type HostOnboarding = Awaited<ReturnType<typeof loadHostOnboarding>>;

export type PendingInvite = { id: string; slug: string; name: string };

export type ProfilePageModel = {
  userId: string;
  userEmail: string;
  profile: ProfileView;
  displayInitials: string;
  positions: string[];
  viewerIsPro: boolean;
  viewerIsAdmin: boolean;
  isHost: boolean;
  newlyGrantedBadges: Awaited<ReturnType<typeof reconcileUserBadges>>;
  shelfBadges: ShelfBadge[];
  friends: FriendEdges['friends'];
  mutualIds: FriendEdges['mutualIds'];
  attendingEvents: EventCardData[];
  upcomingHosted: HostedEvents;
  groupsForSection: MyGroup[];
  myVideos: ProfileMedia;
  pendingInvites: PendingInvite[];
  playerOnboarding: PlayerOnboarding;
  hostOnboarding: HostOnboarding;
  showPlayerOnboarding: boolean;
  showHostOnboarding: boolean;
  editOpen: boolean;
  searchParams: Record<string, string | undefined>;
  hpage: number;
  fpage: number;
  vpage: number;
  apage: number;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export async function loadProfilePage(
  rawSearchParams: Record<string, string | string[] | undefined>,
): Promise<ProfilePageModel> {
  const searchParams: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(rawSearchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const hpage = Math.max(1, Number.parseInt(searchParams.hpage ?? '1', 10) || 1);
  const fpage = Math.max(1, Number.parseInt(searchParams.fpage ?? '1', 10) || 1);
  const vpage = Math.max(1, Number.parseInt(searchParams.vpage ?? '1', 10) || 1);
  const apage = Math.max(1, Number.parseInt(searchParams.apage ?? '1', 10) || 1);
  // Deep-link the Edit-profile disclosure open (the onboarding card's
  // "Complete your profile" step links here). Native <details> stays
  // user-toggleable afterwards.
  const editOpen = searchParams.edit === '1';

  const { supabase, user } = await getCurrentUser();
  if (!user) redirect('/login?next=/profile');

  // Gamification Phase 1: reconcile this player's achievement badges on their
  // own profile view (idempotent), then read the full set for the trophy case.
  // `newlyGrantedBadges` drives the one-time unlock toast.
  const newlyGrantedBadges = await reconcileUserBadges(user.id);
  const ownBadges = await getOwnBadges(user.id);
  const shelfBadges: ShelfBadge[] = ownBadges.map((b) => ({
    badgeKey: b.badgeKey,
    awardedAt: b.awardedAt,
    source: b.source,
    label: typeof b.context?.label === 'string' ? b.context.label : null,
    iconUrl: typeof b.context?.iconUrl === 'string' ? b.context.iconUrl : null,
  }));

  const { data } = await supabase
    .from('profiles')
    .select(
      'handle, first_name, last_name, display_name, home_city, avatar_url, auto_accept_team_invites, show_pro_badge, primary_position, secondary_position, tertiary_position, instagram_handle, tiktok_handle, twitter_handle, facebook_handle, youtube_handle, website_url',
    )
    .eq('id', user.id)
    .maybeSingle();

  const row = data as ProfileRow | null;
  const profile: ProfileView = {
    handle: row?.handle ?? user.id,
    first_name: row?.first_name ?? null,
    last_name: row?.last_name ?? null,
    display_name: row?.display_name ?? user.email?.split('@')[0] ?? 'Player',
    home_city: row?.home_city ?? null,
    avatar_url: row?.avatar_url ?? null,
    auto_accept_team_invites: row?.auto_accept_team_invites ?? false,
    show_pro_badge: row?.show_pro_badge ?? true,
    primary_position: row?.primary_position ?? null,
    secondary_position: row?.secondary_position ?? null,
    tertiary_position: row?.tertiary_position ?? null,
    instagram_handle: row?.instagram_handle ?? null,
    tiktok_handle: row?.tiktok_handle ?? null,
    twitter_handle: row?.twitter_handle ?? null,
    facebook_handle: row?.facebook_handle ?? null,
    youtube_handle: row?.youtube_handle ?? null,
    website_url: row?.website_url ?? null,
  };

  // Outgoing friend edges (people you've added) + incoming-edge user-id
  // set, used to flag mutual friendships in the FriendsList UI. Same
  // SocialGraphQueries port read as /friends.
  const { friends, mutualIds } = await new SupabaseSocialGraphRepository(supabase).getFriendEdges(
    user.id,
  );

  const now = new Date();
  const upcomingHosted = await loadVisibleHostedEvents(supabase, user.id, {
    startsAfter: now,
  });

  // Events the player has joined (individual RSVP) — the hub's "Your events"
  // section. Rendered with the shared EventCard; degrades to an empty array on
  // failure so the rest of the hub still renders.
  const attendingSummaries = await handlers.getAttendingEvents
    .execute(new GetAttendingEventsQuery(user.id, now))
    .catch(() => []);
  const attendingEvents: EventCardData[] = attendingSummaries.map((e) => ({
    id: e.id,
    title: e.title,
    surface: e.surface,
    skillLevel: e.skillLevel,
    type: e.type,
    startsAt: e.startsAt,
    timeZone: e.timeZone,
    city: e.city,
    region: e.region,
    heroImageUrl: e.heroImageUrl,
    relativeDay: relativeEventDay(e.startsAt, e.timeZone, now),
    spotsRemaining: e.spotsRemaining,
    distanceKm: e.distanceKm,
    seriesName: e.seriesName,
    seriesPosition: e.seriesPosition,
    seriesSize: e.seriesSize,
    isFundraiser: e.isFundraiser,
    divisions: e.divisions,
  }));
  const [viewerIsPro, viewerIsAdmin, hostStripeAccountId] = await Promise.all([
    isPro(user.id),
    isPlatformAdmin(user.id),
    getHostStripeAccount(user.id),
  ]);
  // "Is this person already a host?" drives the *copy* of the payout tile, not
  // whether it renders. The tile is always shown so a brand-new user can find
  // their way to Stripe onboarding before they've created any events — gating
  // it behind host status (persona-ux PR-2) left no discoverable path to set up
  // payments. Active hosts get "manage" framing; everyone else gets a softer
  // "get set up to sell tickets" nudge.
  const isHost = upcomingHosted.length > 0 || hostStripeAccountId !== null;

  // Groups the user is a member of (with role).
  const memberships = await new SupabaseGroupQueryRepository(supabase).listMembershipsForUser(
    user.id,
  );

  // The user's own videos (active + auto-hidden) for the manage section.
  const { listProfileMedia } = await getMediaHandlers();
  const myVideos = await listProfileMedia.execute(new ListProfileMediaQuery(user.id, user.id));
  const groupsForSection: MyGroup[] = memberships.map((m) => ({
    id: m.group.id,
    slug: m.group.slug,
    name: m.group.name,
    avatarUrl: m.group.avatarUrl,
    homeCity: m.group.homeCity,
    role: m.role,
  }));

  // Outstanding team invites.
  const { data: pendingRows } = await supabase
    .from('team_members')
    .select('teams:teams!inner(id, slug, name)')
    .eq('user_id', user.id)
    .eq('status', 'pending');
  type PendingRow = {
    teams: { id: string; slug: string; name: string } | null;
  };
  const pendingInvites = ((pendingRows as PendingRow[] | null) ?? [])
    .map((r) => r.teams)
    .filter((t): t is NonNullable<PendingRow['teams']> => t !== null);

  const positions = [
    profile.primary_position,
    profile.secondary_position,
    profile.tertiary_position,
  ]
    .filter((p): p is string => Boolean(p))
    .map((p) => POSITION_LABEL[p] ?? p);

  // Onboarding checklists (ADR 0035, B1/B2). The player track replaces the PR-3
  // "Get started" card with a progress-tracked version; the host track appears
  // only for a viewer showing host intent. Each card hides once its *required*
  // steps are done (optional steps never keep it alive), so neither nags an
  // established user. Both loaders are fail-quiet — a thrown count just shows
  // more open steps; it can't break the hub render.
  const [playerOnboarding, hostOnboarding] = await Promise.all([
    loadPlayerOnboarding(user.id, {
      hasHomeCity: Boolean(profile.home_city),
      positionCount: positions.length,
      groupCount: memberships.length,
    }),
    loadHostOnboarding(user.id, { stripeChargesEnabled: hostStripeAccountId !== null }),
  ]);
  const showPlayerOnboarding = !playerOnboarding.requiredComplete;
  const showHostOnboarding =
    hostOnboarding.hasHostIntent && !hostOnboarding.progress.requiredComplete;

  return {
    userId: user.id,
    userEmail: user.email ?? '',
    profile,
    displayInitials: initials(profile.display_name),
    positions,
    viewerIsPro,
    viewerIsAdmin,
    isHost,
    newlyGrantedBadges,
    shelfBadges,
    friends,
    mutualIds,
    attendingEvents,
    upcomingHosted,
    groupsForSection,
    myVideos,
    pendingInvites,
    playerOnboarding,
    hostOnboarding,
    showPlayerOnboarding,
    showHostOnboarding,
    editOpen,
    searchParams,
    hpage,
    fpage,
    vpage,
    apage,
  };
}
