import type { HostPollResults, PollQueries, PollSummary } from '@pickupvb/domain';

/**
 * Read-side query handlers for polls (ADR 0041). All run on a user-scoped client
 * so the creator-only RLS is the real gate — a non-creator's read returns null /
 * an empty list, never another host's respondents.
 */
export class GetHostPollResultsHandler {
  constructor(private readonly queries: PollQueries) {}

  execute(pollId: string, viewerId: string): Promise<HostPollResults | null> {
    return this.queries.getHostResults(pollId, viewerId);
  }
}

export class ListCreatorPollsHandler {
  constructor(private readonly queries: PollQueries) {}

  execute(creatorId: string): Promise<PollSummary[]> {
    return this.queries.listByCreator(creatorId);
  }
}

export class ListEventPollsHandler {
  constructor(private readonly queries: PollQueries) {}

  execute(eventId: string): Promise<PollSummary[]> {
    return this.queries.listByEvent(eventId);
  }
}

export class ListGroupPollsHandler {
  constructor(private readonly queries: PollQueries) {}

  execute(groupId: string): Promise<PollSummary[]> {
    return this.queries.listByGroup(groupId);
  }
}
