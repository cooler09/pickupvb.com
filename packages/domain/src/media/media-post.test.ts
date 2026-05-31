import { describe, expect, it } from 'vitest';
import { ConflictError, InvariantViolation } from '../shared/result.js';
import { EventId, UserId } from '../events/volleyball-event.js';
import { ExternalVideoUrl } from './external-video-url.js';
import { MediaKind, MediaPost, MediaPostId } from './media-post.js';

const url = ExternalVideoUrl.create('https://youtu.be/dQw4w9WgXcQ');

function make(kind: MediaKind, overrides: { title?: string } = {}): MediaPost {
  return MediaPost.create({
    id: MediaPostId('11111111-1111-1111-1111-111111111111'),
    submitterUserId: UserId('22222222-2222-2222-2222-222222222222'),
    eventId: EventId('33333333-3333-3333-3333-333333333333'),
    matchId: null,
    kind,
    videoUrl: url,
    title: overrides.title ?? 'Match point rally',
    description: '',
  });
}

describe('MediaPost.create', () => {
  it('starts active, unfeatured, with zero reports', () => {
    const p = make('clip');
    expect(p.status).toBe('active');
    expect(p.featured).toBe(false);
    expect(p.reportCount).toBe(0);
  });

  it('rejects a too-short / too-long title', () => {
    expect(() => make('clip', { title: 'ab' })).toThrow(InvariantViolation);
    expect(() => make('clip', { title: 'x'.repeat(201) })).toThrow(InvariantViolation);
  });

  it('only sets liveStartedAt for live streams', () => {
    const live = MediaPost.create({
      id: MediaPostId('1'),
      submitterUserId: UserId('2'),
      eventId: null,
      matchId: null,
      kind: 'live_stream',
      videoUrl: url,
      title: 'Court 1 live',
      description: '',
      liveStartedAt: new Date('2026-06-01T00:00:00Z'),
    });
    expect(live.liveStartedAt).toEqual(new Date('2026-06-01T00:00:00Z'));
    const clip = make('clip');
    expect(clip.liveStartedAt).toBeNull();
  });
});

describe('MediaPost.feature', () => {
  it('promotes an active live stream', () => {
    const live = make('live_stream');
    live.feature();
    expect(live.featured).toBe(true);
  });

  it('rejects featuring a non-live-stream', () => {
    expect(() => make('clip').feature()).toThrow(ConflictError);
    expect(() => make('match_video').feature()).toThrow(ConflictError);
  });

  it('rejects featuring a hidden stream', () => {
    const live = make('live_stream');
    live.hide();
    expect(() => live.feature()).toThrow(ConflictError);
  });
});

describe('MediaPost moderation + lifecycle', () => {
  it('hide clears featured; unhide restores active', () => {
    const live = make('live_stream');
    live.feature();
    live.hide();
    expect(live.status).toBe('hidden');
    expect(live.featured).toBe(false);
    live.unhide();
    expect(live.status).toBe('active');
  });

  it('unhide only works from hidden', () => {
    expect(() => make('clip').unhide()).toThrow(ConflictError);
  });

  it('remove is terminal and blocks updates', () => {
    const p = make('clip');
    p.remove();
    expect(p.status).toBe('removed');
    expect(() => p.update({ title: 'new title' })).toThrow(ConflictError);
    expect(() => p.hide()).toThrow(ConflictError);
  });

  it('endLiveStream records end time and unfeatures', () => {
    const live = make('live_stream');
    live.feature();
    const at = new Date('2026-06-01T02:00:00Z');
    live.endLiveStream(at);
    expect(live.liveEndedAt).toEqual(at);
    expect(live.featured).toBe(false);
  });

  it('endLiveStream rejects non-streams', () => {
    expect(() => make('clip').endLiveStream(new Date())).toThrow(ConflictError);
  });
});

describe('MediaPost.assertVotable', () => {
  it('allows an active clip', () => {
    expect(() => make('clip').assertVotable()).not.toThrow();
  });

  it('rejects non-clip kinds', () => {
    expect(() => make('live_stream').assertVotable()).toThrow(ConflictError);
    expect(() => make('match_video').assertVotable()).toThrow(ConflictError);
  });

  it('rejects a hidden or removed clip', () => {
    const hidden = make('clip');
    hidden.hide();
    expect(() => hidden.assertVotable()).toThrow(ConflictError);
    const removed = make('clip');
    removed.remove();
    expect(() => removed.assertVotable()).toThrow(ConflictError);
  });
});
