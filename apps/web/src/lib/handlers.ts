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
  SupabaseLeagueScheduleRepository,
  SupabaseSocialGraphRepository,
  SupabaseTeamRepository,
  SupabaseUserRepository,
} from '@pickupvb/infrastructure';
import {
  AcceptTeamInviteHandler,
  AddAdHocTeamMemberHandler,
  AddEventCoHostHandler,
  AddEventDivisionHandler,
  AddLeagueScheduleMatchHandler,
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
  MarkWalkInPaidCashHandler,
  RecordLeagueMatchResultHandler,
  RecordMatchResultHandler,
  RegisterAdHocTeamHandler,
  RegisterTeamHandler,
  RegisterWalkInTeamHandler,
  RemoveEventCoHostHandler,
  RemoveEventDivisionHandler,
  RemoveLeagueScheduleMatchHandler,
  RemoveAdHocTeamMemberHandler,
  SetLeagueTeamForfeitedHandler,
  RemoveTeamMemberHandler,
  RenameAdHocTeamRegistrationHandler,
  ReportCommunityListingHandler,
  ResetBracketHandler,
  ResetMatchHandler,
  ReorderPoolMatchesHandler,
  SearchCommunityListingsHandler,
  SearchEventsHandler,
  SeedBracketHandler,
  SetTeamExtraMembersHandler,
  ChangeHandleHandler,
  UnhideCommunityListingHandler,
  UpdateCommunityListingHandler,
  UpdateEventDivisionHandler,
  UpdateProfileHandler,
  UpdateLeagueScheduleMatchHandler,
  WithdrawAdHocTeamRegistrationHandler,
  WithdrawTeamHandler,
} from '@pickupvb/application';
import { getServerSupabase } from './supabase';
import { analytics } from './analytics';

export { analytics };

const eventRepo = new SupabaseEventRepository();
const teamRepo = new SupabaseTeamRepository();
const eventTeamRegistrationRepo = new SupabaseEventTeamRegistrationRepository();
const eventTeamPaymentRepo = new SupabaseEventTeamPaymentRepository();
const bracketRepo = new SupabaseBracketRepository();
const hostStripeAccountRepo = new SupabaseHostStripeAccountRepository();
const hostSubscriptionRepo = new SupabaseHostSubscriptionRepository();
const communityListingRepo = new SupabaseCommunityListingRepository();
const leagueScheduleRepo = new SupabaseLeagueScheduleRepository();
const socialGraphRepo = new SupabaseSocialGraphRepository();

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
  joinEvent: new JoinEventHandler(eventRepo, analytics),
  joinEventWithPosition: new JoinEventWithPositionHandler(eventRepo, analytics),
  leaveEvent: new LeaveEventHandler(eventRepo, analytics),
  joinEventAsFreeAgent: new JoinEventAsFreeAgentHandler(eventRepo),
  leaveEventAsFreeAgent: new LeaveEventAsFreeAgentHandler(eventRepo),
  searchEvents: new SearchEventsHandler(eventRepo),
  getEventById: new GetEventByIdHandler(eventRepo),
  getEventDetail: new GetEventDetailHandler(eventRepo),
  getFollowingFeed: new GetFollowingFeedHandler(socialGraphRepo),
  getViewerFriends: new GetViewerFriendsHandler(socialGraphRepo),
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
  // ADR 0017 walk-in team registrations
  registerWalkInTeam: new RegisterWalkInTeamHandler(eventRepo, eventTeamRegistrationRepo),
  markWalkInPaidCash: new MarkWalkInPaidCashHandler(eventRepo, eventTeamRegistrationRepo),
  createBracket: new CreateBracketHandler(eventRepo, bracketRepo),
  seedBracket: new SeedBracketHandler(eventRepo, bracketRepo),
  generateBracket: new GenerateBracketHandler(eventRepo, bracketRepo),
  generatePlayoff: new GeneratePlayoffHandler(eventRepo, bracketRepo),
  resetBracket: new ResetBracketHandler(eventRepo, bracketRepo),
  reorderPoolMatches: new ReorderPoolMatchesHandler(eventRepo, bracketRepo),
  // NOTE: the captain-reachable match-result writes (bracket record/reset,
  // league score entry) are intentionally NOT here. They must run through a
  // user-scoped client so RLS enforces "host or captain of this match" —
  // see `getMatchResultHandlers()` below. The module-singleton repos use the
  // service-role admin client, which would bypass that gate.
  // League schedule (per-division weekly slate)
  addLeagueScheduleMatch: new AddLeagueScheduleMatchHandler(eventRepo, leagueScheduleRepo),
  updateLeagueScheduleMatch: new UpdateLeagueScheduleMatchHandler(eventRepo, leagueScheduleRepo),
  removeLeagueScheduleMatch: new RemoveLeagueScheduleMatchHandler(eventRepo, leagueScheduleRepo),
  setLeagueTeamForfeited: new SetLeagueTeamForfeitedHandler(eventRepo),
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

/**
 * Per-request handlers for the captain-reachable match-result writes
 * (bracket record/reset, league score entry).
 *
 * Unlike the module-singleton `handlers` above — which run through the
 * service-role admin client and bypass RLS — these are built per request
 * around a *user-scoped* Supabase client bound to the caller's auth cookies.
 * That is what lets the `is_bracket_match_captain` / `is_league_match_captain`
 * / `is_event_host` RLS policies (and the `record_*_match_result` RPCs that
 * call them) actually enforce "host or captain of this match." Recording a
 * result is the one mutation a non-host may perform, so it cannot share the
 * admin-client path. See docs/audits/event-data-model.md.
 */
export async function getMatchResultHandlers(): Promise<{
  recordMatchResult: RecordMatchResultHandler;
  resetMatch: ResetMatchHandler;
  recordLeagueMatchResult: RecordLeagueMatchResultHandler;
}> {
  const client = await getServerSupabase();
  const userBracketRepo = new SupabaseBracketRepository(client);
  const userLeagueScheduleRepo = new SupabaseLeagueScheduleRepository(client);
  return {
    recordMatchResult: new RecordMatchResultHandler(userBracketRepo),
    resetMatch: new ResetMatchHandler(userBracketRepo),
    recordLeagueMatchResult: new RecordLeagueMatchResultHandler(userLeagueScheduleRepo),
  };
}

/**
 * Per-request handlers for the user's own profile writes (ADR 0020).
 *
 * Like `getMatchResultHandlers()`, these are built per request around a
 * *user-scoped* Supabase client so the `profiles` RLS policy (`id = auth.uid()`)
 * is the real authorization gate — a profile edit is a self-write, so it must
 * not share the admin-client path of the module-singleton `handlers`.
 */
export async function getUserProfileHandlers(): Promise<{
  updateProfile: UpdateProfileHandler;
  changeHandle: ChangeHandleHandler;
}> {
  const client = await getServerSupabase();
  const userRepo = new SupabaseUserRepository(client);
  return {
    updateProfile: new UpdateProfileHandler(userRepo),
    changeHandle: new ChangeHandleHandler(userRepo),
  };
}

export const repositories = {
  bracketRepo,
  eventRepo,
  eventTeamPaymentRepo,
  eventTeamRegistrationRepo,
  leagueScheduleRepo,
  hostStripeAccountRepo,
  hostSubscriptionRepo,
  communityListingRepo,
  socialGraphRepo,
};
