import { describe, expect, it } from 'vitest';
import { ValidationError } from '../shared/result.js';
import { ExternalVideoUrl } from './external-video-url.js';

// `ExternalVideoUrl` classifies an off-platform video link into a provider +
// id + subtype so the web layer can build a *first-party* embed for
// YouTube/Twitch instead of iframing raw user input. Everything else falls
// back to a link card (`embeddable === false`).

describe('ExternalVideoUrl.create — validation', () => {
  it('rejects empty / missing input', () => {
    expect(() => ExternalVideoUrl.create('')).toThrow(ValidationError);
    expect(() => ExternalVideoUrl.create('   ')).toThrow(ValidationError);
  });

  it('rejects a non-absolute or unparseable URL', () => {
    expect(() => ExternalVideoUrl.create('youtube.com/watch?v=abc')).toThrow(ValidationError);
    expect(() => ExternalVideoUrl.create('not a url')).toThrow(ValidationError);
  });

  it('rejects non-https schemes', () => {
    expect(() => ExternalVideoUrl.create('http://youtube.com/watch?v=abc')).toThrow(
      ValidationError,
    );
  });

  it('rejects our own hosts', () => {
    expect(() => ExternalVideoUrl.create('https://pickupvb.com/events/1')).toThrow(ValidationError);
    expect(() => ExternalVideoUrl.create('https://www.pickupvb.com/x')).toThrow(ValidationError);
  });

  it('trims surrounding whitespace', () => {
    const v = ExternalVideoUrl.create('  https://youtu.be/dQw4w9WgXcQ  ');
    expect(v.externalId).toBe('dQw4w9WgXcQ');
  });
});

describe('ExternalVideoUrl.create — YouTube', () => {
  it('parses youtu.be short links', () => {
    const v = ExternalVideoUrl.create('https://youtu.be/dQw4w9WgXcQ');
    expect(v.provider).toBe('youtube');
    expect(v.externalId).toBe('dQw4w9WgXcQ');
    expect(v.subtype).toBe('video');
    expect(v.embeddable).toBe(true);
  });

  it('parses watch?v= links (incl. www and extra params)', () => {
    const v = ExternalVideoUrl.create('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s');
    expect(v.provider).toBe('youtube');
    expect(v.externalId).toBe('dQw4w9WgXcQ');
    expect(v.subtype).toBe('video');
  });

  it('parses /shorts/ links', () => {
    const v = ExternalVideoUrl.create('https://youtube.com/shorts/abc123');
    expect(v.subtype).toBe('short');
    expect(v.externalId).toBe('abc123');
  });

  it('parses /live/ links', () => {
    const v = ExternalVideoUrl.create('https://www.youtube.com/live/xyz789');
    expect(v.subtype).toBe('live');
    expect(v.externalId).toBe('xyz789');
  });

  it('is not embeddable when the video id is missing', () => {
    const v = ExternalVideoUrl.create('https://www.youtube.com/watch?list=PLxyz');
    expect(v.provider).toBe('youtube');
    expect(v.externalId).toBeNull();
    expect(v.embeddable).toBe(false);
  });
});

describe('ExternalVideoUrl.create — Twitch', () => {
  it('parses a VOD link', () => {
    const v = ExternalVideoUrl.create('https://www.twitch.tv/videos/123456789');
    expect(v.provider).toBe('twitch');
    expect(v.subtype).toBe('video');
    expect(v.externalId).toBe('123456789');
    expect(v.embeddable).toBe(true);
  });

  it('parses a live channel link', () => {
    const v = ExternalVideoUrl.create('https://twitch.tv/somevbchannel');
    expect(v.subtype).toBe('channel');
    expect(v.externalId).toBe('somevbchannel');
  });

  it('parses a channel clip link', () => {
    const v = ExternalVideoUrl.create('https://www.twitch.tv/somechannel/clip/FunnySlug-abc');
    expect(v.subtype).toBe('clip');
    expect(v.externalId).toBe('FunnySlug-abc');
  });

  it('parses a clips.twitch.tv link', () => {
    const v = ExternalVideoUrl.create('https://clips.twitch.tv/FunnySlug-abc');
    expect(v.subtype).toBe('clip');
    expect(v.externalId).toBe('FunnySlug-abc');
  });

  it('parses a player.twitch.tv?video= link', () => {
    const v = ExternalVideoUrl.create('https://player.twitch.tv/?video=987654321&parent=x');
    expect(v.subtype).toBe('video');
    expect(v.externalId).toBe('987654321');
  });
});

describe('ExternalVideoUrl.create — link-card-only providers', () => {
  it('parses Instagram reels', () => {
    const v = ExternalVideoUrl.create('https://www.instagram.com/reel/CxYz123/');
    expect(v.provider).toBe('instagram');
    expect(v.externalId).toBe('CxYz123');
    expect(v.subtype).toBeNull();
    expect(v.embeddable).toBe(false);
  });

  it('parses TikTok video links', () => {
    const v = ExternalVideoUrl.create('https://www.tiktok.com/@user/video/7300000000000000000');
    expect(v.provider).toBe('tiktok');
    expect(v.externalId).toBe('7300000000000000000');
    expect(v.embeddable).toBe(false);
  });

  it('classifies Facebook / fb.watch', () => {
    expect(ExternalVideoUrl.create('https://fb.watch/abc/').provider).toBe('facebook');
    expect(ExternalVideoUrl.create('https://www.facebook.com/watch?v=123').provider).toBe(
      'facebook',
    );
  });

  it('falls back to "other" for any other https host (e.g. Hudl)', () => {
    const v = ExternalVideoUrl.create('https://www.hudl.com/video/abc');
    expect(v.provider).toBe('other');
    expect(v.externalId).toBeNull();
    expect(v.embeddable).toBe(false);
  });
});

describe('ExternalVideoUrl.fromPersistence', () => {
  it('rehydrates without re-parsing', () => {
    const v = ExternalVideoUrl.fromPersistence('https://x/y', 'youtube', 'abc', 'video');
    expect(v.provider).toBe('youtube');
    expect(v.externalId).toBe('abc');
    expect(v.embeddable).toBe(true);
  });
});
