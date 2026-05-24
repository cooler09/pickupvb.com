/**
 * Composition root for server-side handlers.
 * Wires concrete adapters (infrastructure) into application handlers.
 * One place to swap implementations (e.g. for tests).
 */
import {
  SupabaseBracketRepository,
  SupabaseCommunityListingRepository,
  SupabaseEventRepository,
  SupabaseEventTeamPaymentRepository,
  SupabaseEventTeamRegistrationRepository,
  SupabaseHostStripeAccountRepository,
  SupabaseHostSubscriptionRepository,
  SupabaseTeamRepository,
  analyticsFromEnv,
} from '@pickupvb/infrastructure';
import {
  AcceptTeamInviteHandler,
  AddAdHocTeamMemberHandler,
  AddEventCoHostHandler,
  AddEventDivisionHandler,
  AddTeamMemberHandler,
  ClaimCommunityListingHandler,
  ApproveCommunityListingClaimHandler,
  RejectCommunityListingClaimHandler,
  CreateBracketHandler,
  CreateCommunityListingHandler,
  CreateEventHandler,
  CreateTeamHandler,
  DeleteCommunityListingHandler,
  GenerateBracketHandler,
  GeneratePlayoffHandler,
  GetCommunityListingDetailHandler,
  GetEventByIdHandler,
  GetEventDetailHandler,
  GetFollowingFeedHandler,
  GetViewerFriendsHandler,
  HideCommunityListingHandler,
  JoinEventAsFreeAgentHandler,
  JoinEventHandler,
  JoinEventWithPositionHandler,
  LeaveEventAsFreeAgentHandler,
  LeaveEventHandler,
  RecordMatchResultHandler,
  RegisterAdHocTeamHandler,
  RegisterTeamHandler,
  RemoveEventCoHostHandler,
  RemoveEventDivisionHandler,
  RemoveAdHocTeamMemberHandler,
  RemoveTeamMemberHandler,
  RenameAdHocTeamRegistrationHandler,
  ReportCommunityListingHandler,
  ResetBracketHandler,
  ResetMatchHandler,
  SearchCommunityListingsHandler,
  SearchEventsHandler,
  SeedBracketHandler,
  SetTeamExtraMembersHandler,
  UnhideCommunityListingHandler,
  UpdateCommunityListingHandler,
  UpdateEventDivisionHandler,
  WithdrawAdHocTeamRegistrationHandler,
  WithdrawTeamHandler,
} from '@pickupvb/application';
import { getServerSupabase } from './supabase';

const eventRepo = new SupabaseEventRepository();
const teamRepo = new SupabaseTeamRepository();
const eventTeamRegistrationRepo = new SupabaseEventTeamRegistrationRepository();
const eventTeamPaymentRepo = new SupabaseEventTeamPaymentRepository();
const bracketRepo = new SupabaseBracketRepository();
const hostStripeAccountRepo = new SupabaseHostStripeAccountRepository();
const hostSubscriptionRepo = new SupabaseHostSubscriptionRepository();
const communityListingRepo = new SupabaseCommunityListingRepository();

const isPlatformAdmin = (userId: string) => communityListingRepo.isPlatformAdmin(userId);

/**
 * Loads the minimum event metadata `ClaimCommunityListingHandler` needs to
 * authorize a community-listing claim: who owns the event (primary host +
 * co-hosts) and the date/city it happens, for the "same-day + same-city"
 * match check.
 */
const loadEventClaimFacts = async (
  eventId: string,
): Promise<{
  hostId: string;
  coHostIds: string[];
  startsAt: Date;
  city: string | null;
  timeZone: string | null;
} | null> => {
  const supabase = await getServerSupabase();
  const [eventResult, coHostResult] = await Promise.all([
    supabase
      .from('events')
      .select('host_id, starts_at, city, time_zone')
      .eq('id', eventId)
      .maybeSingle(),
    supabase
      .from('event_co_hosts')
      .select('host_user_id')
      .eq('event_id', eventId)
      .not('host_user_id', 'is', null),
  ]);
  const row = eventResult.data as {
    host_id: string;
    starts_at: string;
    city: string | null;
    time_zone: string | null;
  } | null;
  if (!row) return null;
  const coHostIds = ((coHostResult.data as { host_user_id: string | null }[] | null) ?? [])
    .map((r) => r.host_user_id)
    .filter((id): id is string => !!id);
  return {
    hostId: row.host_id,
    coHostIds,
    startsAt: new Date(row.starts_at),
    city: row.city,
    timeZone: row.time_zone,
  };
};

export const handlers = {
  createEvent: new CreateEventHandler(eventRepo),
  joinEvent: new JoinEventHandler(eventRepo),
  joinEventWithPosition: new JoinEventWithPositionHandler(eventRepo),
  leaveEvent: new LeaveEventHandler(eventRepo),
  joinEventAsFreeAgent: new JoinEventAsFreeAgentHandler(eventRepo),
  leaveEventAsFreeAgent: new LeaveEventAsFreeAgentHandler(eventRepo),
  searchEvents: new SearchEventsHandler(eventRepo),
  getEventById: new GetEventByIdHandler(eventRepo),
  getEventDetail: new GetEventDetailHandler(eventRepo),
  getFollowingFeed: new GetFollowingFeedHandler(eventRepo),
  getViewerFriends: new GetViewerFriendsHandler(eventRepo),
  addEventCoHost: new AddEventCoHostHandler(eventRepo),
  removeEventCoHost: new RemoveEventCoHostHandler(eventRepo),
  addEventDivision: new AddEventDivisionHandler(eventRepo),
  updateEventDivision: new UpdateEventDivisionHandler(eventRepo),
  removeEventDivision: new RemoveEventDivisionHandler(eventRepo),
  createTeam: new CreateTeamHandler(teamRepo),
  addTeamMember: new AddTeamMemberHandler(teamRepo),
  acceptTeamInvite: new AcceptTeamInviteHandler(teamRepo),
  removeTeamMember: new RemoveTeamMemberHandler(teamRepo),
  setTeamExtraMembers: new SetTeamExtraMembersHandler(teamRepo),
  registerTeam: new RegisterTeamHandler(eventRepo, teamRepo),
  withdrawTeam: new WithdrawTeamHandler(eventRepo, teamRepo),
  // ADR 0007 ad-hoc team registrations
  registerAdHocTeam: new RegisterAdHocTeamHandler(eventRepo, eventTeamRegistrationRepo),
  renameAdHocTeamRegistration: new RenameAdHocTeamRegistrationHandler(eventTeamRegistrationRepo),
  addAdHocTeamMember: new AddAdHocTeamMemberHandler(eventTeamRegistrationRepo),
  removeAdHocTeamMember: new RemoveAdHocTeamMemberHandler(eventTeamRegistrationRepo),
  withdrawAdHocTeamRegistration: new WithdrawAdHocTeamRegistrationHandler(
    eventTeamRegistrationRepo,
  ),
  createBracket: new CreateBracketHandler(eventRepo, bracketRepo),
  seedBracket: new SeedBracketHandler(eventRepo, bracketRepo),
  generateBracket: new GenerateBracketHandler(eventRepo, bracketRepo),
  generatePlayoff: new GeneratePlayoffHandler(eventRepo, bracketRepo),
  resetBracket: new ResetBracketHandler(eventRepo, bracketRepo),
  recordMatchResult: new RecordMatchResultHandler(bracketRepo),
  resetMatch: new ResetMatchHandler(bracketRepo),
  // Community listings
  createCommunityListing: new CreateCommunityListingHandler(communityListingRepo),
  updateCommunityListing: new UpdateCommunityListingHandler(communityListingRepo, isPlatformAdmin),
  deleteCommunityListing: new DeleteCommunityListingHandler(communityListingRepo, isPlatformAdmin),
  reportCommunityListing: new ReportCommunityListingHandler(communityListingRepo),
  hideCommunityListing: new HideCommunityListingHandler(communityListingRepo, isPlatformAdmin),
  unhideCommunityListing: new UnhideCommunityListingHandler(communityListingRepo, isPlatformAdmin),
  claimCommunityListing: new ClaimCommunityListingHandler(
    communityListingRepo,
    loadEventClaimFacts,
  ),
  approveCommunityListingClaim: new ApproveCommunityListingClaimHandler(
    communityListingRepo,
    isPlatformAdmin,
  ),
  rejectCommunityListingClaim: new RejectCommunityListingClaimHandler(
    communityListingRepo,
    isPlatformAdmin,
  ),
  searchCommunityListings: new SearchCommunityListingsHandler(communityListingRepo),
  getCommunityListingDetail: new GetCommunityListingDetailHandler(communityListingRepo),
};

export const repositories = {
  bracketRepo,
  eventRepo,
  eventTeamPaymentRepo,
  eventTeamRegistrationRepo,
  hostStripeAccountRepo,
  hostSubscriptionRepo,
  communityListingRepo,
};

/**
 * Server-side analytics adapter (PostHog when configured, noop otherwise).
 * Resolved once at module load so the PostHog client is reused across
 * requests in the same serverless instance. Call sites should `await
 * analytics.shutdown()` from a `finally` block in long-running scripts
 * (worker cron) but **not** in per-request handlers — the adapter
 * flushes synchronously (`flushAt: 1`).
 *
 * See [docs/audits/analytics.md](../../../../docs/audits/analytics.md).
 */
export const analytics = analyticsFromEnv();
