import { describe, it, expect } from 'vitest';
import {
  ConflictError,
  ExternalVideoUrl,
  MediaPost,
  MediaPostId,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  EventId,
  UserId,
  type EventMediaReadModel,
  type MediaPostItem,
  type MediaPostRepository,
} from '@pickupvb/domain';
import {
  CreateMediaPostHandler,
  FeatureEventStreamHandler,
  RemoveMediaPostHandler,
  ReportMediaPostHandler,
  UpdateMediaPostHandler,
} from './media-post.handler.js';
import {
  CreateMediaPostCommand,
  FeatureEventStreamCommand,
  RemoveMediaPostCommand,
  ReportMediaPostCommand,
  UpdateMediaPostCommand,
} from '../messages.js';

const SUBMITTER = '22222222-2222-2222-2222-222222222222';
const HOST = '44444444-4444-4444-4444-444444444444';
const STRANGER = '55555555-5555-5555-5555-555555555555';
const ADMIN = '66666666-6666-6666-6666-666666666666';
const EVENT = '33333333-3333-3333-3333-333333333333';

const isAdmin = (id: string): Promise<boolean> => Promise.resolve(id === ADMIN);
const isHost = (eventId: string, id: string): Promise<boolean> =>
  Promise.resolve(eventId === EVENT && id === HOST);

class FakeMediaRepo implements MediaPostRepository {
  posts = new Map<string, MediaPost>();
  reports: Array<{ postId: string; reporterUserId: string }> = [];
  featured: { eventId: string; postId: string } | null = null;
  countResult = 0;
  saved = 0;

  findById(id: string): Promise<MediaPost | null> {
    return Promise.resolve(this.posts.get(id) ?? null);
  }
  save(post: MediaPost): Promise<void> {
    this.posts.set(String(post.id), post);
    this.saved += 1;
    return Promise.resolve();
  }
  delete(): Promise<void> {
    return Promise.resolve();
  }
  countByUserSince(): Promise<number> {
    return Promise.resolve(this.countResult);
  }
  recordReport(postId: string, reporterUserId: string): Promise<void> {
    this.reports.push({ postId, reporterUserId });
    return Promise.resolve();
  }
  featureEventStream(eventId: string, postId: string): Promise<void> {
    this.featured = { eventId, postId };
    return Promise.resolve();
  }
  listForEvent(): Promise<EventMediaReadModel> {
    return Promise.resolve({ liveStreams: [], matchVideos: [], clips: [], canManageEvent: false });
  }
  listForProfile(): Promise<MediaPostItem[]> {
    return Promise.resolve([]);
  }
  getEventMediaSummary(): Promise<{ totalCount: number; liveCount: number; featured: null }> {
    return Promise.resolve({ totalCount: 0, liveCount: 0, featured: null });
  }
}

function seedClip(repo: FakeMediaRepo, id = 'aaaa'): MediaPost {
  const post = MediaPost.create({
    id: MediaPostId(id),
    submitterUserId: UserId(SUBMITTER),
    eventId: EventId(EVENT),
    matchId: null,
    kind: 'clip',
    videoUrl: ExternalVideoUrl.create('https://youtu.be/dQw4w9WgXcQ'),
    title: 'Great rally',
    description: '',
  });
  repo.posts.set(id, post);
  return post;
}

describe('CreateMediaPostHandler', () => {
  it('creates a post for a real user', async () => {
    const repo = new FakeMediaRepo();
    const res = await new CreateMediaPostHandler(repo).execute(
      new CreateMediaPostCommand(SUBMITTER, {
        eventId: EVENT,
        matchId: null,
        kind: 'clip',
        videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
        title: 'My clip',
        description: '',
      }),
    );
    expect(repo.posts.get(res.id)?.title).toBe('My clip');
  });

  it('rejects once the 24h rate limit is hit', async () => {
    const repo = new FakeMediaRepo();
    repo.countResult = 20;
    await expect(
      new CreateMediaPostHandler(repo).execute(
        new CreateMediaPostCommand(SUBMITTER, {
          eventId: EVENT,
          matchId: null,
          kind: 'clip',
          videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
          title: 'Too many',
          description: '',
        }),
      ),
    ).rejects.toThrow(RateLimitError);
  });
});

describe('UpdateMediaPostHandler — authorization', () => {
  it('lets the submitter update', async () => {
    const repo = new FakeMediaRepo();
    seedClip(repo);
    await new UpdateMediaPostHandler(repo, isAdmin, isHost).execute(
      new UpdateMediaPostCommand('aaaa', SUBMITTER, { title: 'Edited title' }),
    );
    expect(repo.posts.get('aaaa')?.title).toBe('Edited title');
  });

  it('lets the event host update', async () => {
    const repo = new FakeMediaRepo();
    seedClip(repo);
    await new UpdateMediaPostHandler(repo, isAdmin, isHost).execute(
      new UpdateMediaPostCommand('aaaa', HOST, { title: 'Host edit' }),
    );
    expect(repo.posts.get('aaaa')?.title).toBe('Host edit');
  });

  it('rejects a stranger', async () => {
    const repo = new FakeMediaRepo();
    seedClip(repo);
    await expect(
      new UpdateMediaPostHandler(repo, isAdmin, isHost).execute(
        new UpdateMediaPostCommand('aaaa', STRANGER, { title: 'Nope' }),
      ),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('throws NotFound for a missing post', async () => {
    const repo = new FakeMediaRepo();
    await expect(
      new UpdateMediaPostHandler(repo, isAdmin, isHost).execute(
        new UpdateMediaPostCommand('missing', SUBMITTER, { title: 'x' }),
      ),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('RemoveMediaPostHandler', () => {
  it('soft-removes when an admin requests it', async () => {
    const repo = new FakeMediaRepo();
    seedClip(repo);
    await new RemoveMediaPostHandler(repo, isAdmin, isHost).execute(
      new RemoveMediaPostCommand('aaaa', ADMIN),
    );
    expect(repo.posts.get('aaaa')?.status).toBe('removed');
  });
});

describe('ReportMediaPostHandler', () => {
  it('records a report on an existing post', async () => {
    const repo = new FakeMediaRepo();
    seedClip(repo);
    await new ReportMediaPostHandler(repo).execute(
      new ReportMediaPostCommand('aaaa', STRANGER, 'spam'),
    );
    expect(repo.reports).toEqual([{ postId: 'aaaa', reporterUserId: STRANGER }]);
  });

  it('throws NotFound for a missing post', async () => {
    const repo = new FakeMediaRepo();
    await expect(
      new ReportMediaPostHandler(repo).execute(
        new ReportMediaPostCommand('missing', STRANGER, null),
      ),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('FeatureEventStreamHandler', () => {
  function seedStream(repo: FakeMediaRepo): MediaPost {
    const post = MediaPost.create({
      id: MediaPostId('bbbb'),
      submitterUserId: UserId(SUBMITTER),
      eventId: EventId(EVENT),
      matchId: null,
      kind: 'live_stream',
      videoUrl: ExternalVideoUrl.create('https://twitch.tv/somechannel'),
      title: 'Court 1 live',
      description: '',
    });
    repo.posts.set('bbbb', post);
    return post;
  }

  it('features a live stream when the host requests it', async () => {
    const repo = new FakeMediaRepo();
    seedStream(repo);
    await new FeatureEventStreamHandler(repo, isAdmin, isHost).execute(
      new FeatureEventStreamCommand('bbbb', HOST),
    );
    expect(repo.featured).toEqual({ eventId: EVENT, postId: 'bbbb' });
  });

  it('rejects featuring a clip', async () => {
    const repo = new FakeMediaRepo();
    seedClip(repo);
    await expect(
      new FeatureEventStreamHandler(repo, isAdmin, isHost).execute(
        new FeatureEventStreamCommand('aaaa', HOST),
      ),
    ).rejects.toThrow(ConflictError);
  });

  it('rejects a non-host', async () => {
    const repo = new FakeMediaRepo();
    seedStream(repo);
    await expect(
      new FeatureEventStreamHandler(repo, isAdmin, isHost).execute(
        new FeatureEventStreamCommand('bbbb', STRANGER),
      ),
    ).rejects.toThrow(UnauthorizedError);
  });
});
