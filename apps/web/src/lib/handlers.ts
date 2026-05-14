/**
 * Composition root for server-side handlers.
 * Wires concrete adapters (infrastructure) into application handlers.
 * One place to swap implementations (e.g. for tests).
 */
import { SupabaseEventRepository, SupabaseTeamRepository } from '@pickupvb/infrastructure';
import {
    AcceptTeamInviteHandler,
    AddEventCoHostHandler,
    AddTeamMemberHandler,
    CreateEventHandler,
    CreateTeamHandler,
    GetEventByIdHandler,
    GetEventDetailHandler,
    GetFollowingFeedHandler,
    GetViewerFriendsHandler,
    JoinEventAsFreeAgentHandler,
    JoinEventHandler,
    LeaveEventAsFreeAgentHandler,
    LeaveEventHandler,
    RegisterTeamHandler,
    RemoveEventCoHostHandler,
    RemoveTeamMemberHandler,
    SearchEventsHandler,
    SetTeamExtraMembersHandler,
    WithdrawTeamHandler,
} from '@pickupvb/application';

const eventRepo = new SupabaseEventRepository();
const teamRepo = new SupabaseTeamRepository();

export const handlers = {
    createEvent: new CreateEventHandler(eventRepo),
    joinEvent: new JoinEventHandler(eventRepo),
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
};
