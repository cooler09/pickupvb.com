import type { VideoProvider, VideoSubtype } from '@pickupvb/domain';
import { externalLinkHref } from '@/lib/external-link';

const PROVIDER_LABEL: Record<VideoProvider, string> = {
  youtube: 'YouTube',
  twitch: 'Twitch',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  other: 'the source',
};

// Twitch requires `parent` to match the embedding page's host. Our deploy
// domains are a known, stable set, so we pass all of them (Twitch accepts
// repeated `parent` params) rather than reading the request host at runtime —
// that keeps embeds usable inside ISR-cached pages (e.g. /players/[id]) that
// must not call `headers()`.
const TWITCH_PARENTS = ['pickupvb.com', 'www.pickupvb.com', 'dev.pickupvb.com', 'localhost'];
const TWITCH_PARENT_QS = TWITCH_PARENTS.map((p) => `parent=${encodeURIComponent(p)}`).join('&');

/**
 * Build a **first-party** embed src from the parsed provider + id. We never
 * iframe a raw user URL — only YouTube and Twitch (where we control the embed
 * domain) get an iframe; everything else falls back to a link card.
 */
function embedSrc(
  provider: VideoProvider,
  externalId: string | null,
  subtype: VideoSubtype,
): string | null {
  if (!externalId) return null;
  const id = encodeURIComponent(externalId);
  if (provider === 'youtube') {
    return `https://www.youtube-nocookie.com/embed/${id}`;
  }
  if (provider === 'twitch') {
    if (subtype === 'clip') return `https://clips.twitch.tv/embed?clip=${id}&${TWITCH_PARENT_QS}`;
    if (subtype === 'video') {
      return `https://player.twitch.tv/?video=${id}&${TWITCH_PARENT_QS}&autoplay=false`;
    }
    if (subtype === 'channel') {
      return `https://player.twitch.tv/?channel=${id}&${TWITCH_PARENT_QS}&autoplay=false`;
    }
  }
  return null;
}

export function VideoEmbed({
  provider,
  externalId,
  subtype,
  videoUrl,
  title,
}: {
  provider: VideoProvider;
  externalId: string | null;
  subtype: VideoSubtype;
  videoUrl: string;
  title: string;
}) {
  const src = embedSrc(provider, externalId, subtype);
  if (src) {
    return (
      <div className="rounded-shape-sm aspect-video w-full overflow-hidden bg-black">
        <iframe
          src={src}
          title={title}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  // Link-card fallback for Instagram / TikTok / Facebook / other (no safe
  // first-party iframe).
  const label = PROVIDER_LABEL[provider];
  return (
    <a
      href={externalLinkHref(videoUrl)}
      target="_blank"
      rel="noopener noreferrer"
      className="border-border-base hover:bg-fg/5 rounded-shape-sm flex aspect-video w-full flex-col items-center justify-center gap-1 border text-center"
    >
      <span aria-hidden="true" className="text-3xl">
        ▶
      </span>
      <span className="text-fg text-sm font-medium">Watch on {label}</span>
      <span className="text-muted text-xs">Opens in a new tab</span>
    </a>
  );
}
