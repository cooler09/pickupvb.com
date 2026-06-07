import type { CreateMediaPostDto, UpdateMediaPostDto } from '@pickupvb/types';

// ---- Media posts commands -----------------------------------------------
export class CreateMediaPostCommand {
  constructor(
    public readonly submitterUserId: string,
    public readonly dto: CreateMediaPostDto,
  ) {}
}

export class UpdateMediaPostCommand {
  constructor(
    public readonly postId: string,
    public readonly requesterId: string,
    public readonly dto: UpdateMediaPostDto,
  ) {}
}

export class RemoveMediaPostCommand {
  constructor(
    public readonly postId: string,
    public readonly requesterId: string,
  ) {}
}

export class ReportMediaPostCommand {
  constructor(
    public readonly postId: string,
    public readonly reporterUserId: string,
    public readonly reason: string | null,
  ) {}
}

export class HideMediaPostCommand {
  constructor(
    public readonly postId: string,
    public readonly requesterId: string,
  ) {}
}

export class UnhideMediaPostCommand {
  constructor(
    public readonly postId: string,
    public readonly requesterId: string,
  ) {}
}

/** Host promotes one live stream as the event's featured stream (RPC clears others). */
export class FeatureEventStreamCommand {
  constructor(
    public readonly postId: string,
    public readonly requesterId: string,
  ) {}
}

export class UnfeatureMediaPostCommand {
  constructor(
    public readonly postId: string,
    public readonly requesterId: string,
  ) {}
}

export class EndLiveStreamCommand {
  constructor(
    public readonly postId: string,
    public readonly requesterId: string,
  ) {}
}

/** Cast/move the voter's award vote for a clip (one per category per event). */
export class CastVoteCommand {
  constructor(
    public readonly eventId: string,
    public readonly postId: string,
    public readonly category: string,
    public readonly voterUserId: string,
  ) {}
}

export class RetractVoteCommand {
  constructor(
    public readonly eventId: string,
    public readonly category: string,
    public readonly voterUserId: string,
  ) {}
}

// ---- Media posts queries ------------------------------------------------
export class ListEventMediaQuery {
  constructor(
    public readonly eventId: string,
    public readonly viewerId: string | null,
  ) {}
}

export class ListProfileMediaQuery {
  constructor(
    public readonly userId: string,
    public readonly viewerId: string | null,
  ) {}
}
