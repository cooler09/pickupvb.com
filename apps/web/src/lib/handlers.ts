/**
 * Composition root for server-side handlers.
 * Wires concrete adapters (infrastructure) into application handlers.
 * One place to swap implementations (e.g. for tests).
 */
import {
    SupabaseBracketRepository,
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
    CreateEventHandler,
    CreateTeamHandler,
    GenerateBracketHandler,
    GeneratePlayoffHandler,
    GetEventByIdHandler,
    GetEventDetailHandler,
    GetFollowingFeedHandler,
    GetViewerFriendsHandler,
    JoinEventAsFreeAgentHandler,
    JoinEventHandler,
    JoinEventWithPositionHandler,
    LeaveEventAsFreeAgentHandler,
    LeaveEventHandler,
    RecordMatchResultHandler,
    RegisterTeamHandler,
    RemoveEventCoHostHandler,
    RemoveTeamMemberHandler,
    ResetBracketHandler,
    ResetMatchHandler,
    SearchEventsHandler,
    SeedBracketHandler,
    SetTeamExtraMembersHandler,
    WithdrawTeamHandler,
} from '@pickupvb/application';

const eventRepo = new SupabaseEventRepository();
const teamRepo = new SupabaseTeamRepository();
const bracketRepo = new SupabaseBracketRepository();
const hostStripeAccountRepo = new SupabaseHostStripeAccountRepository();
const hostSubscriptionRepo = new SupabaseHostSubscriptionRepository();

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
};

export const repositories = {
    bracketRepo,
    eventRepo,
    hostStripeAccountRepo,
    hostSubscriptionRepo,
};
