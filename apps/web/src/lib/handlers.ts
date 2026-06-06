/**
 * Composition root for server-side handlers.
 * Wires concrete adapters (infrastructure) into application handlers.
 * One place to swap implementations (e.g. for tests).
 */
import {
  SupabaseBracketRepository,
  SupabaseCommunityListingRepository,
  SupabaseEventPaymentRepository,
  SupabaseEventRepository,
  SupabaseEventTeamPaymentRepository,
  SupabaseEventTeamRegistrationRepository,
  SupabaseHostStripeAccountRepository,
  SupabaseHostSubscriptionRepository,
  SupabaseLeagueScheduleRepository,
  SupabaseLiveMatchScoreRepository,
  SupabaseMediaPostRepository,
  SupabaseGroupRepository,
  SupabaseSocialGraphRepository,
  SupabaseTeamRepository,
  SupabaseUserRepository,
  SupabaseConversationRepository,
  SupabaseMessageRepository,
  SupabaseMessageQueries,
  SupabaseConversationQueries,
  SupabaseDeletionRequestRepository,
} from '@pickupvb/infrastructure';
import {
  AcceptTeamInviteHandler,
  AddAdHocTeamMemberHandler,
  AddEventCoHostHandler,
  AddEventDivisionHandler,
  AddLeagueScheduleMatchHandler,
  GenerateLeagueScheduleHandler,
  ClearLeagueScheduleHandler,
  AddTeamMemberHandler,
  ClaimCommunityListingHandler,
  ApproveCommunityListingClaimHandler,
  AutoApproveExpiredCommunityClaimsHandler,
  RejectCommunityListingClaimHandler,
  ClearLiveMatchScoreHandler,
  CastVoteHandler,
  CreateBracketHandler,
  CreateCommunityListingHandler,
  CreateEventHandler,
  CreateMediaPostHandler,
  CreateTeamHandler,
  DeleteCommunityListingHandler,
  EndLiveStreamHandler,
  FeatureEventStreamHandler,
  HideMediaPostHandler,
  ListEventMediaHandler,
  ListProfileMediaHandler,
  RemoveMediaPostHandler,
  ReportMediaPostHandler,
  RetractVoteHandler,
  UnfeatureMediaPostHandler,
  UnhideMediaPostHandler,
  UpdateMediaPostHandler,
  GenerateBracketHandler,
  GeneratePlayoffHandler,
  GetCommunityListingDetailHandler,
  GetEventBracketMetaHandler,
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
  PublishBracketHandler,
  ReopenBracketHandler,
  SetPoolsHandler,
  EditMatchHandler,
  AddMatchHandler,
  RemoveMatchHandler,
  SeedPlayoffHandler,
  ReplaceEntryHandler,
  SearchCommunityListingsHandler,
  SearchEventsHandler,
  GetAttendingEventsHandler,
  SeedBracketHandler,
  CreateStandaloneBracketHandler,
  SeedStandaloneBracketHandler,
  GenerateStandaloneBracketHandler,
  GenerateStandalonePlayoffHandler,
  ResetStandaloneBracketHandler,
  ReopenStandaloneBracketHandler,
  DeleteStandaloneBracketHandler,
  ReorderStandalonePoolMatchesHandler,
  SeedStandalonePlayoffHandler,
  PublishStandaloneBracketHandler,
  SetStandalonePoolsHandler,
  EditStandaloneMatchHandler,
  AddStandaloneMatchHandler,
  RemoveStandaloneMatchHandler,
  ReplaceStandaloneEntryHandler,
  AddBracketTeamHandler,
  AddBracketTeamsHandler,
  SetTeamExtraMembersHandler,
  AddFriendHandler,
  AddGroupMemberHandler,
  ChangeGroupMemberRoleHandler,
  ChangeHandleHandler,
  CreateGroupHandler,
  DeleteGroupHandler,
  FollowGroupHandler,
  RemoveGroupMemberHandler,
  SetGroupAvatarHandler,
  UnfollowGroupHandler,
  RemoveFriendHandler,
  SetProfileAvatarHandler,
  SetProfileHeroImageHandler,
  SetProfileThemeHandler,
  UnhideCommunityListingHandler,
  UpdateBusinessInfoHandler,
  UpdateCommunityListingHandler,
  UpdateEventDivisionHandler,
  UpdateGroupProfileHandler,
  UpdateProfileHandler,
  UpdateLeagueScheduleMatchHandler,
  UpsertLiveMatchScoreHandler,
  WithdrawAdHocTeamRegistrationHandler,
  WithdrawTeamHandler,
  OpenConversationHandler,
  OpenDmHandler,
  SendMessageHandler,
  EditMessageHandler,
  DeleteMessageHandler,
  ReportMessageHandler,
  MarkConversationReadHandler,
  ListMessagesHandler,
  ListInboxHandler,
  CountUnreadConversationsHandler,
  RequestAccountDeletionHandler,
  CancelAccountDeletionHandler,
} from '@pickupvb/application';
import { getServerSupabase } from './supabase';
import { getAdminSupabase } from './supabase-admin';
import { analytics } from './analytics';

export { analytics };

const eventRepo = new SupabaseEventRepository();
const teamRepo = new SupabaseTeamRepository();
const eventTeamRegistrationRepo = new SupabaseEventTeamRegistrationRepository();
const eventTeamPaymentRepo = new SupabaseEventTeamPaymentRepository();
const eventPaymentRepo = new SupabaseEventPaymentRepository();
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
  createEvent: new CreateEventHandler(eventRepo, analytics),
  joinEvent: new JoinEventHandler(eventRepo, analytics),
  joinEventWithPosition: new JoinEventWithPositionHandler(eventRepo, analytics),
  leaveEvent: new LeaveEventHandler(eventRepo, analytics),
  joinEventAsFreeAgent: new JoinEventAsFreeAgentHandler(eventRepo, analytics),
  leaveEventAsFreeAgent: new LeaveEventAsFreeAgentHandler(eventRepo, analytics),
  searchEvents: new SearchEventsHandler(eventRepo),
  getAttendingEvents: new GetAttendingEventsHandler(eventRepo),
  getEventById: new GetEventByIdHandler(eventRepo),
  getEventDetail: new GetEventDetailHandler(eventRepo),
  getEventBracketMeta: new GetEventBracketMetaHandler(eventRepo),
  getFollowingFeed: new GetFollowingFeedHandler(socialGraphRepo),
  getViewerFriends: new GetViewerFriendsHandler(socialGraphRepo),
  addEventCoHost: new AddEventCoHostHandler(eventRepo),
  removeEventCoHost: new RemoveEventCoHostHandler(eventRepo),
  addEventDivision: new AddEventDivisionHandler(eventRepo, analytics),
  updateEventDivision: new UpdateEventDivisionHandler(eventRepo, analytics),
  removeEventDivision: new RemoveEventDivisionHandler(eventRepo, analytics),
  createTeam: new CreateTeamHandler(teamRepo),
  addTeamMember: new AddTeamMemberHandler(teamRepo),
  acceptTeamInvite: new AcceptTeamInviteHandler(teamRepo),
  removeTeamMember: new RemoveTeamMemberHandler(teamRepo),
  setTeamExtraMembers: new SetTeamExtraMembersHandler(teamRepo),
  registerTeam: new RegisterTeamHandler(eventRepo, teamRepo, analytics),
  withdrawTeam: new WithdrawTeamHandler(eventRepo, teamRepo, analytics),
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
  createBracket: new CreateBracketHandler(eventRepo, bracketRepo, analytics),
  seedBracket: new SeedBracketHandler(eventRepo, bracketRepo, analytics),
  generateBracket: new GenerateBracketHandler(eventRepo, bracketRepo, analytics),
  generatePlayoff: new GeneratePlayoffHandler(eventRepo, bracketRepo, analytics),
  resetBracket: new ResetBracketHandler(eventRepo, bracketRepo, analytics),
  reorderPoolMatches: new ReorderPoolMatchesHandler(eventRepo, bracketRepo, analytics),
  // ADR 0032 — host-gated structural edits to the draft / live bracket. All
  // run on the admin-client bracketRepo (host already authorized in the
  // handler via assertHost), like the other host-gated mutations above.
  publishBracket: new PublishBracketHandler(eventRepo, bracketRepo, analytics),
  reopenBracket: new ReopenBracketHandler(eventRepo, bracketRepo, analytics),
  setBracketPools: new SetPoolsHandler(eventRepo, bracketRepo, analytics),
  editBracketMatch: new EditMatchHandler(eventRepo, bracketRepo, analytics),
  addBracketMatch: new AddMatchHandler(eventRepo, bracketRepo, analytics),
  removeBracketMatch: new RemoveMatchHandler(eventRepo, bracketRepo, analytics),
  seedBracketPlayoff: new SeedPlayoffHandler(eventRepo, bracketRepo, analytics),
  replaceBracketEntry: new ReplaceEntryHandler(eventRepo, bracketRepo, analytics),
  // ADR 0025 standalone (event-free) brackets — owner-gated full-replace runs
  // on the admin-client bracketRepo (the app authorizes via `bracket.ownerUserId`).
  createStandaloneBracket: new CreateStandaloneBracketHandler(bracketRepo, analytics),
  seedStandaloneBracket: new SeedStandaloneBracketHandler(bracketRepo, analytics),
  generateStandaloneBracket: new GenerateStandaloneBracketHandler(bracketRepo, analytics),
  generateStandalonePlayoff: new GenerateStandalonePlayoffHandler(bracketRepo, analytics),
  seedStandalonePlayoff: new SeedStandalonePlayoffHandler(bracketRepo, analytics),
  resetStandaloneBracket: new ResetStandaloneBracketHandler(bracketRepo, analytics),
  reopenStandaloneBracket: new ReopenStandaloneBracketHandler(bracketRepo, analytics),
  deleteStandaloneBracket: new DeleteStandaloneBracketHandler(bracketRepo),
  reorderStandalonePoolMatches: new ReorderStandalonePoolMatchesHandler(bracketRepo, analytics),
  // Standalone manual-edit suite (ADR 0032 / TT-11) — owner-gated structural
  // edits to a draft / live standalone bracket, mirroring the event path.
  publishStandaloneBracket: new PublishStandaloneBracketHandler(bracketRepo, analytics),
  setStandalonePools: new SetStandalonePoolsHandler(bracketRepo, analytics),
  editStandaloneMatch: new EditStandaloneMatchHandler(bracketRepo, analytics),
  addStandaloneMatch: new AddStandaloneMatchHandler(bracketRepo, analytics),
  removeStandaloneMatch: new RemoveStandaloneMatchHandler(bracketRepo, analytics),
  replaceStandaloneEntry: new ReplaceStandaloneEntryHandler(bracketRepo, analytics),
  addBracketTeam: new AddBracketTeamHandler(bracketRepo),
  addBracketTeams: new AddBracketTeamsHandler(bracketRepo),
  // NOTE: the captain-reachable match-result writes (bracket record/reset,
  // league score entry) are intentionally NOT here. They must run through a
  // user-scoped client so RLS enforces "host or captain of this match" —
  // see `getMatchResultHandlers()` below. The module-singleton repos use the
  // service-role admin client, which would bypass that gate.
  // League schedule (per-division weekly slate)
  addLeagueScheduleMatch: new AddLeagueScheduleMatchHandler(eventRepo, leagueScheduleRepo),
  generateLeagueSchedule: new GenerateLeagueScheduleHandler(eventRepo, leagueScheduleRepo),
  clearLeagueSchedule: new ClearLeagueScheduleHandler(eventRepo, leagueScheduleRepo),
  updateLeagueScheduleMatch: new UpdateLeagueScheduleMatchHandler(eventRepo, leagueScheduleRepo),
  removeLeagueScheduleMatch: new RemoveLeagueScheduleMatchHandler(eventRepo, leagueScheduleRepo),
  setLeagueTeamForfeited: new SetLeagueTeamForfeitedHandler(eventRepo),
  // Community listings
  createCommunityListing: new CreateCommunityListingHandler(communityListingRepo, isPlatformAdmin),
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
  autoApproveExpiredCommunityClaims: new AutoApproveExpiredCommunityClaimsHandler(
    communityListingRepo,
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
  upsertLiveMatchScore: UpsertLiveMatchScoreHandler;
  clearLiveMatchScore: ClearLiveMatchScoreHandler;
}> {
  const client = await getServerSupabase();
  const userBracketRepo = new SupabaseBracketRepository(client);
  const userLeagueScheduleRepo = new SupabaseLeagueScheduleRepository(client);
  // ADR 0023: the live (in-progress) score is captain-reachable, so it shares
  // the user-scoped client — the `upsert_match_live_score` / `clear_match_live_score`
  // RPCs enforce "host or captain of this match" against auth.uid().
  const userLiveScoreRepo = new SupabaseLiveMatchScoreRepository(client);
  return {
    recordMatchResult: new RecordMatchResultHandler(userBracketRepo, analytics),
    resetMatch: new ResetMatchHandler(userBracketRepo, analytics),
    recordLeagueMatchResult: new RecordLeagueMatchResultHandler(userLeagueScheduleRepo),
    upsertLiveMatchScore: new UpsertLiveMatchScoreHandler(userLiveScoreRepo),
    clearLiveMatchScore: new ClearLiveMatchScoreHandler(userLiveScoreRepo),
  };
}

/**
 * Per-request handlers for media posts (videos / livestreams / clips).
 *
 * Built around a *user-scoped* client so the `media_posts` RLS policies
 * (submitter / `is_event_host` / admin) and the host-gated
 * `feature_event_stream` RPC are the real authorization gate — never the
 * module-singleton admin-client path. `isEventHost` defers to the SQL
 * `is_event_host` RPC (auth.uid()-based) so group co-hosts are covered, not
 * just the primary host; the application-layer check is a typed-error
 * pre-flight before the RLS/RPC enforces server-side (AGENTS.md gotcha #8).
 */
export async function getMediaHandlers(): Promise<{
  createMediaPost: CreateMediaPostHandler;
  updateMediaPost: UpdateMediaPostHandler;
  removeMediaPost: RemoveMediaPostHandler;
  reportMediaPost: ReportMediaPostHandler;
  hideMediaPost: HideMediaPostHandler;
  unhideMediaPost: UnhideMediaPostHandler;
  featureEventStream: FeatureEventStreamHandler;
  unfeatureMediaPost: UnfeatureMediaPostHandler;
  endLiveStream: EndLiveStreamHandler;
  castVote: CastVoteHandler;
  retractVote: RetractVoteHandler;
  listEventMedia: ListEventMediaHandler;
  listProfileMedia: ListProfileMediaHandler;
}> {
  const client = await getServerSupabase();
  const mediaRepo = new SupabaseMediaPostRepository(client);

  const isEventHost = async (eventId: string): Promise<boolean> => {
    const { data, error } = await client.rpc('is_event_host', { p_event_id: eventId });
    if (error) return false;
    return data === true;
  };

  return {
    createMediaPost: new CreateMediaPostHandler(mediaRepo),
    updateMediaPost: new UpdateMediaPostHandler(mediaRepo, isPlatformAdmin, isEventHost),
    removeMediaPost: new RemoveMediaPostHandler(mediaRepo, isPlatformAdmin, isEventHost),
    reportMediaPost: new ReportMediaPostHandler(mediaRepo),
    hideMediaPost: new HideMediaPostHandler(mediaRepo, isPlatformAdmin, isEventHost),
    unhideMediaPost: new UnhideMediaPostHandler(mediaRepo, isPlatformAdmin, isEventHost),
    featureEventStream: new FeatureEventStreamHandler(mediaRepo, isPlatformAdmin, isEventHost),
    unfeatureMediaPost: new UnfeatureMediaPostHandler(mediaRepo, isPlatformAdmin, isEventHost),
    endLiveStream: new EndLiveStreamHandler(mediaRepo, isPlatformAdmin, isEventHost),
    castVote: new CastVoteHandler(mediaRepo),
    retractVote: new RetractVoteHandler(mediaRepo),
    listEventMedia: new ListEventMediaHandler(mediaRepo),
    listProfileMedia: new ListProfileMediaHandler(mediaRepo),
  };
}

/**
 * Per-request handlers for chat / messaging (ADR 0028). Built around a
 * *user-scoped* client so every chat write is authorized by RLS — the
 * `messages` INSERT/UPDATE policies and the `get_or_create_conversation`
 * membership RPC read the real `auth.uid()` (AGENTS.md pitfall #8). The
 * module-singleton admin-client `handlers` would bypass that gate.
 */
export async function getChatHandlers(): Promise<{
  openConversation: OpenConversationHandler;
  openDm: OpenDmHandler;
  sendMessage: SendMessageHandler;
  editMessage: EditMessageHandler;
  deleteMessage: DeleteMessageHandler;
  reportMessage: ReportMessageHandler;
  markConversationRead: MarkConversationReadHandler;
  listMessages: ListMessagesHandler;
  listInbox: ListInboxHandler;
  countUnreadConversations: CountUnreadConversationsHandler;
}> {
  const client = await getServerSupabase();
  const conversationRepo = new SupabaseConversationRepository(client);
  const messageRepo = new SupabaseMessageRepository(client);
  const messageQueries = new SupabaseMessageQueries(client);
  const conversationQueries = new SupabaseConversationQueries(client);

  // Pre-flight of `can_moderate_conversation` — consulted only on the rarer
  // non-sender delete path (DeleteMessageHandler skips it for self-deletes).
  const canModerate = async (conversationId: string): Promise<boolean> => {
    const { data, error } = await client.rpc('can_moderate_conversation', {
      p_conversation_id: conversationId,
    });
    if (error) return false;
    return data === true;
  };

  return {
    openConversation: new OpenConversationHandler(conversationRepo),
    openDm: new OpenDmHandler(conversationRepo),
    sendMessage: new SendMessageHandler(messageRepo),
    editMessage: new EditMessageHandler(messageRepo),
    deleteMessage: new DeleteMessageHandler(messageRepo, canModerate),
    reportMessage: new ReportMessageHandler(messageRepo),
    markConversationRead: new MarkConversationReadHandler(conversationRepo),
    listMessages: new ListMessagesHandler(messageQueries),
    listInbox: new ListInboxHandler(conversationQueries),
    countUnreadConversations: new CountUnreadConversationsHandler(conversationQueries),
  };
}

/**
 * Per-request handlers for account deletion (ADR 0029). User-scoped client so
 * the `deletion_requests` RLS (`auth.uid() = user_id`) is the real gate on the
 * arm / cancel writes — a user can only schedule or cancel their own deletion.
 * The cron's execute path builds its own admin-scoped repo (see the
 * execute-deletions route), not this factory.
 */
export async function getAccountDeletionHandlers(): Promise<{
  requestAccountDeletion: RequestAccountDeletionHandler;
  cancelAccountDeletion: CancelAccountDeletionHandler;
}> {
  const client = await getServerSupabase();
  const repo = new SupabaseDeletionRequestRepository(client);
  return {
    requestAccountDeletion: new RequestAccountDeletionHandler(repo),
    cancelAccountDeletion: new CancelAccountDeletionHandler(repo),
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
  setTheme: SetProfileThemeHandler;
  setHeroImage: SetProfileHeroImageHandler;
  setAvatar: SetProfileAvatarHandler;
  updateBusinessInfo: UpdateBusinessInfoHandler;
  addFriend: AddFriendHandler;
  removeFriend: RemoveFriendHandler;
}> {
  const client = await getServerSupabase();
  const userRepo = new SupabaseUserRepository(client);
  return {
    updateProfile: new UpdateProfileHandler(userRepo),
    changeHandle: new ChangeHandleHandler(userRepo),
    setTheme: new SetProfileThemeHandler(userRepo),
    setHeroImage: new SetProfileHeroImageHandler(userRepo),
    setAvatar: new SetProfileAvatarHandler(userRepo),
    updateBusinessInfo: new UpdateBusinessInfoHandler(userRepo),
    addFriend: new AddFriendHandler(userRepo),
    removeFriend: new RemoveFriendHandler(userRepo),
  };
}

/**
 * Per-request handlers for group writes (ADR 0021). Built around a *user-scoped*
 * client so the `groups` RLS policies (`created_by = auth.uid()` on insert,
 * owner/admin on update) are the real authorization gate — never the
 * module-singleton admin-client `handlers`.
 */
export async function getGroupHandlers(): Promise<{
  createGroup: CreateGroupHandler;
  updateGroupProfile: UpdateGroupProfileHandler;
  setGroupAvatar: SetGroupAvatarHandler;
  addGroupMember: AddGroupMemberHandler;
  removeGroupMember: RemoveGroupMemberHandler;
  changeGroupMemberRole: ChangeGroupMemberRoleHandler;
  followGroup: FollowGroupHandler;
  unfollowGroup: UnfollowGroupHandler;
  deleteGroup: DeleteGroupHandler;
}> {
  const client = await getServerSupabase();
  const groupRepo = new SupabaseGroupRepository(client);

  // Cross-aggregate guard: does the group host any upcoming, non-cancelled
  // event? Read on the user-scoped client (the owner can see their group's
  // events via the events_select policy).
  const hostsUpcomingEvents = async (groupId: string): Promise<boolean> => {
    const { count } = await client
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('host_group_id', groupId)
      .neq('status', 'cancelled')
      .gt('starts_at', new Date().toISOString());
    return (count ?? 0) > 0;
  };

  // RLS quirk: the `groups_select` policy (deleted_at is null) is applied as an
  // implicit WITH CHECK on UPDATE, so flipping `deleted_at` via the user client
  // fails (the after-image would be invisible). Owner authorization is enforced
  // by `Group.assertCanDelete` first, so the admin-client write is sanctioned
  // (AGENTS.md pitfall #8).
  const softDeleteGroup = async (groupId: string): Promise<void> => {
    const admin = getAdminSupabase();
    const { error } = await admin
      .from('groups')
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq('id', groupId);
    if (error) throw new Error(`Group soft-delete failed: ${error.message}`);
  };

  return {
    createGroup: new CreateGroupHandler(groupRepo),
    updateGroupProfile: new UpdateGroupProfileHandler(groupRepo),
    setGroupAvatar: new SetGroupAvatarHandler(groupRepo),
    addGroupMember: new AddGroupMemberHandler(groupRepo),
    removeGroupMember: new RemoveGroupMemberHandler(groupRepo),
    changeGroupMemberRole: new ChangeGroupMemberRoleHandler(groupRepo),
    followGroup: new FollowGroupHandler(groupRepo),
    unfollowGroup: new UnfollowGroupHandler(groupRepo),
    deleteGroup: new DeleteGroupHandler(groupRepo, hostsUpcomingEvents, softDeleteGroup),
  };
}

export const repositories = {
  bracketRepo,
  eventRepo,
  eventPaymentRepo,
  eventTeamPaymentRepo,
  eventTeamRegistrationRepo,
  leagueScheduleRepo,
  hostStripeAccountRepo,
  hostSubscriptionRepo,
  communityListingRepo,
  socialGraphRepo,
};
