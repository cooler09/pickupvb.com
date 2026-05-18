/**
 * Composition root for server-side handlers.
 * Wires concrete adapters (infrastructure) into application handlers.
 * One place to swap implementations (e.g. for tests).
 */
import {
  SupabaseBracketRepository,
  SupabaseCommunityListingRepository,
  SupabaseEventRepository,
  SupabaseHostStripeAccountRepository,
  SupabaseHostSubscriptionRepository,
  SupabaseTeamRepository,
} from '@pickupvb/infrastructure';
import {
  AcceptTeamInviteHandler,
  AddEventCoHostHandler,
  AddTeamMemberHandler,
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
  RegisterTeamHandler,
  RemoveEventCoHostHandler,
  RemoveTeamMemberHandler,
  ReportCommunityListingHandler,
  ResetBracketHandler,
  ResetMatchHandler,
  SearchCommunityListingsHandler,
  SearchEventsHandler,
  SeedBracketHandler,
  SetTeamExtraMembersHandler,
  UnhideCommunityListingHandler,
  UpdateCommunityListingHandler,
  WithdrawTeamHandler,
} from '@pickupvb/application';

const eventRepo = new SupabaseEventRepository();
const teamRepo = new SupabaseTeamRepository();
const bracketRepo = new SupabaseBracketRepository();
const hostStripeAccountRepo = new SupabaseHostStripeAccountRepository();
const hostSubscriptionRepo = new SupabaseHostSubscriptionRepository();
const communityListingRepo = new SupabaseCommunityListingRepository();

const isPlatformAdmin = (userId: string) => communityListingRepo.isPlatformAdmin(userId);

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
  createTeam: new CreateTeamHandler(teamRepo),
  addTeamMember: new AddTeamMemberHandler(teamRepo),
  acceptTeamInvite: new AcceptTeamInviteHandler(teamRepo),
  removeTeamMember: new RemoveTeamMemberHandler(teamRepo),
  setTeamExtraMembers: new SetTeamExtraMembersHandler(teamRepo),
  registerTeam: new RegisterTeamHandler(eventRepo, teamRepo),
  withdrawTeam: new WithdrawTeamHandler(eventRepo, teamRepo),
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
  searchCommunityListings: new SearchCommunityListingsHandler(communityListingRepo),
  getCommunityListingDetail: new GetCommunityListingDetailHandler(communityListingRepo),
};

export const repositories = {
  bracketRepo,
  eventRepo,
  hostStripeAccountRepo,
  hostSubscriptionRepo,
  communityListingRepo,
};
