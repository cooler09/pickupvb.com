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
} from '@pickupvb/infrastructure';
import {
  AcceptTeamInviteHandler,
  AddAdHocTeamMemberHandler,
  AddEventCoHostHandler,
  AddEventDivisionHandler,
  AddTeamMemberHandler,
  ClaimCommunityListingHandler,
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

const isHostOfEvent = async (userId: string, eventId: string): Promise<boolean> => {
  const supabase = await getServerSupabase();
  const { data } = await supabase.from('events').select('host_id').eq('id', eventId).maybeSingle();
  if (!data) return false;
  return (data as { host_id: string }).host_id === userId;
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
  claimCommunityListing: new ClaimCommunityListingHandler(communityListingRepo, isHostOfEvent),
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
