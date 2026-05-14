/**
 * Composition root for server-side handlers.
 * Wires concrete adapters (infrastructure) into application handlers.
 * One place to swap implementations (e.g. for tests).
 */
import { SupabaseEventRepository } from '@pickupvb/infrastructure';
import {
    AddEventCoHostHandler,
    CreateEventHandler,
    GetEventByIdHandler,
    GetEventDetailHandler,
    GetFollowingFeedHandler,
    GetViewerFriendsHandler,
    JoinEventHandler,
    LeaveEventHandler,
    RemoveEventCoHostHandler,
    SearchEventsHandler,
} from '@pickupvb/application';

const eventRepo = new SupabaseEventRepository();

export const handlers = {
    createEvent: new CreateEventHandler(eventRepo),
    joinEvent: new JoinEventHandler(eventRepo),
    leaveEvent: new LeaveEventHandler(eventRepo),
    searchEvents: new SearchEventsHandler(eventRepo),
    getEventById: new GetEventByIdHandler(eventRepo),
    getEventDetail: new GetEventDetailHandler(eventRepo),
    getFollowingFeed: new GetFollowingFeedHandler(eventRepo),
    getViewerFriends: new GetViewerFriendsHandler(eventRepo),
    addEventCoHost: new AddEventCoHostHandler(eventRepo),
    removeEventCoHost: new RemoveEventCoHostHandler(eventRepo),
};
