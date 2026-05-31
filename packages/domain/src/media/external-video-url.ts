import { ValidationError } from '../shared/result.js';

// Minimal URL global declaration. The domain package intentionally avoids
// importing from `node:*` (to stay framework-free); the WHATWG `URL`
// constructor is available in every modern JS runtime (Node 18+, browsers,
// edge runtimes), so we declare the shape we use locally.
declare const URL: {
  new (input: string): {
    protocol: string;
    hostname: string;
    pathname: string;
    searchParams: { get(name: string): string | null };
    toString(): string;
  };
};

/**
 * Recognized video sources. `other` is a catch-all for any other off-platform
 * https link (e.g. Hudl, a personal site) — still postable, but rendered as a
 * plain "Watch on …" link card rather than an inline player.
 */
export type VideoProvider = 'youtube' | 'twitch' | 'instagram' | 'tiktok' | 'facebook' | 'other';

/**
 * Provider-specific link shape. Non-null only for the embeddable providers
 * (`youtube` / `twitch`) where the subtype determines how we build the iframe
 * src. `null` for everything else.
 */
export type VideoSubtype = 'video' | 'short' | 'live' | 'channel' | 'clip' | null;

interface ParsedTarget {
  provider: VideoProvider;
  externalId: string | null;
  subtype: VideoSubtype;
}

/**
 * Validated external video URL for a media post.
 *
 * Rules (mirrors {@link ExternalUrl}, plus provider parsing):
 *   - Must parse as an absolute URL.
 *   - Scheme must be `https:`.
 *   - Hostname must not be one of our own domains — media points off-platform.
 *
 * On success the URL is classified into a `provider` + `externalId` + `subtype`
 * so the web layer can build a **first-party** embed src for YouTube/Twitch
 * (`embeddable === true`) instead of iframing raw user input. Unrecognized
 * hosts fall back to `provider: 'other'` (link-card only).
 *
 * Failures throw `ValidationError`; callers validate at the form/handler
 * boundary. Embed-URL construction is intentionally **not** here — Twitch
 * needs the request host for its `parent=` param, a web-layer concern.
 */
export class ExternalVideoUrl {
  private static readonly BLOCKED_HOSTS = new Set<string>([
    'pickupvb.com',
    'www.pickupvb.com',
    'dev.pickupvb.com',
    'localhost',
    '127.0.0.1',
  ]);

  private constructor(
    public readonly value: string,
    public readonly provider: VideoProvider,
    public readonly externalId: string | null,
    public readonly subtype: VideoSubtype,
  ) {}

  /** True when we can construct a safe first-party iframe from `externalId`. */
  get embeddable(): boolean {
    return (this.provider === 'youtube' || this.provider === 'twitch') && this.externalId !== null;
  }

  static create(raw: string): ExternalVideoUrl {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) {
      throw new ValidationError('Video URL is required.');
    }
    let parsed: {
      protocol: string;
      hostname: string;
      pathname: string;
      searchParams: { get(name: string): string | null };
      toString(): string;
    };
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new ValidationError('Video URL must be a valid absolute URL.');
    }
    if (parsed.protocol !== 'https:') {
      throw new ValidationError('Video URL must use https.');
    }
    const hostname = parsed.hostname.toLowerCase();
    const host = hostname.replace(/^www\./, '');
    if (ExternalVideoUrl.BLOCKED_HOSTS.has(hostname) || ExternalVideoUrl.BLOCKED_HOSTS.has(host)) {
      throw new ValidationError('Video URL must point to an off-platform source.');
    }
    const target = ExternalVideoUrl.classify(host, parsed);
    return new ExternalVideoUrl(
      parsed.toString(),
      target.provider,
      target.externalId,
      target.subtype,
    );
  }

  /** Bypass validation/parsing — only for hydrating already-stored values. */
  static fromPersistence(
    value: string,
    provider: VideoProvider,
    externalId: string | null,
    subtype: VideoSubtype,
  ): ExternalVideoUrl {
    return new ExternalVideoUrl(value, provider, externalId, subtype);
  }

  toString(): string {
    return this.value;
  }

  // ---- Provider classification --------------------------------------------
  private static classify(
    host: string,
    parsed: { pathname: string; searchParams: { get(name: string): string | null } },
  ): ParsedTarget {
    const segs = parsed.pathname.split('/').filter(Boolean);

    // --- YouTube ---
    if (host === 'youtu.be') {
      return { provider: 'youtube', externalId: segs[0] ?? null, subtype: 'video' };
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      if (segs[0] === 'shorts')
        return { provider: 'youtube', externalId: segs[1] ?? null, subtype: 'short' };
      if (segs[0] === 'live')
        return { provider: 'youtube', externalId: segs[1] ?? null, subtype: 'live' };
      if (segs[0] === 'embed')
        return { provider: 'youtube', externalId: segs[1] ?? null, subtype: 'video' };
      return { provider: 'youtube', externalId: parsed.searchParams.get('v'), subtype: 'video' };
    }

    // --- Twitch ---
    if (host === 'clips.twitch.tv') {
      return { provider: 'twitch', externalId: segs[0] ?? null, subtype: 'clip' };
    }
    if (host === 'player.twitch.tv') {
      const video = parsed.searchParams.get('video');
      if (video) return { provider: 'twitch', externalId: video, subtype: 'video' };
      const channel = parsed.searchParams.get('channel');
      return { provider: 'twitch', externalId: channel, subtype: 'channel' };
    }
    if (host === 'twitch.tv' || host === 'm.twitch.tv') {
      if (segs[0] === 'videos')
        return { provider: 'twitch', externalId: segs[1] ?? null, subtype: 'video' };
      if (segs[1] === 'clip')
        return { provider: 'twitch', externalId: segs[2] ?? null, subtype: 'clip' };
      if (segs[0]) return { provider: 'twitch', externalId: segs[0], subtype: 'channel' };
    }

    // --- Link-card-only providers (no first-party iframe) ---
    if (host === 'instagram.com' || host === 'm.instagram.com') {
      return {
        provider: 'instagram',
        externalId: ExternalVideoUrl.instagramId(segs),
        subtype: null,
      };
    }
    if (host === 'tiktok.com' || host === 'vm.tiktok.com' || host === 'vt.tiktok.com') {
      const vi = segs.indexOf('video');
      return {
        provider: 'tiktok',
        externalId: vi >= 0 ? (segs[vi + 1] ?? null) : null,
        subtype: null,
      };
    }
    if (
      host === 'facebook.com' ||
      host === 'm.facebook.com' ||
      host === 'fb.watch' ||
      host === 'fb.gg'
    ) {
      return { provider: 'facebook', externalId: null, subtype: null };
    }

    return { provider: 'other', externalId: null, subtype: null };
  }

  /** Pull the shortcode after an Instagram `/reel|reels|p|tv/` path segment. */
  private static instagramId(segs: string[]): string | null {
    const i = segs.findIndex((s) => s === 'reel' || s === 'reels' || s === 'p' || s === 'tv');
    return i >= 0 ? (segs[i + 1] ?? null) : null;
  }
}
