import { socialUrl, type SocialHandles } from '@/lib/social-handles';

type Props = {
  handles: SocialHandles;
  /** Optional className for the wrapper `<ul>`. */
  className?: string;
};

type Item = {
  key: keyof SocialHandles;
  label: string;
  href: string;
  icon: React.ReactNode;
};

/**
 * Inline list of clickable social-media icons. Renders nothing if the
 * profile hasn't set any handles. Icons are bundled inline SVGs (no extra
 * dependency).
 */
export function SocialLinks({ handles, className }: Props) {
  const items: Item[] = [];
  if (handles.instagramHandle) {
    items.push({
      key: 'instagramHandle',
      label: `Instagram @${handles.instagramHandle}`,
      href: socialUrl('instagramHandle', handles.instagramHandle),
      icon: <InstagramIcon />,
    });
  }
  if (handles.tiktokHandle) {
    items.push({
      key: 'tiktokHandle',
      label: `TikTok @${handles.tiktokHandle}`,
      href: socialUrl('tiktokHandle', handles.tiktokHandle),
      icon: <TikTokIcon />,
    });
  }
  if (handles.twitterHandle) {
    items.push({
      key: 'twitterHandle',
      label: `X @${handles.twitterHandle}`,
      href: socialUrl('twitterHandle', handles.twitterHandle),
      icon: <XIcon />,
    });
  }
  if (handles.facebookHandle) {
    items.push({
      key: 'facebookHandle',
      label: `Facebook ${handles.facebookHandle}`,
      href: socialUrl('facebookHandle', handles.facebookHandle),
      icon: <FacebookIcon />,
    });
  }
  if (handles.youtubeHandle) {
    items.push({
      key: 'youtubeHandle',
      label: `YouTube ${handles.youtubeHandle}`,
      href: socialUrl('youtubeHandle', handles.youtubeHandle),
      icon: <YouTubeIcon />,
    });
  }
  if (handles.websiteUrl) {
    let display = handles.websiteUrl;
    try {
      display = new URL(handles.websiteUrl).host.replace(/^www\./, '');
    } catch {
      /* keep raw */
    }
    items.push({
      key: 'websiteUrl',
      label: `Website ${display}`,
      href: handles.websiteUrl,
      icon: <GlobeIcon />,
    });
  }

  if (items.length === 0) return null;

  return (
    <ul className={`flex flex-wrap items-center gap-2 ${className ?? ''}`}>
      {items.map((it) => (
        <li key={it.key}>
          <a
            href={it.href}
            target="_blank"
            rel="noopener noreferrer me"
            aria-label={it.label}
            title={it.label}
            className="text-fg/70 hover:text-primary border-border-base hover:border-primary/40 inline-flex h-8 w-8 items-center justify-center rounded-full border"
          >
            {it.icon}
          </a>
        </li>
      ))}
    </ul>
  );
}

// ── Inline SVG icons (16x16, currentColor) ──────────────────────────────

function InstagramIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M19.6 7.4a6.3 6.3 0 0 1-3.6-1.1v8.3a5.4 5.4 0 1 1-5.4-5.4v2.6a2.8 2.8 0 1 0 2.8 2.8V2h2.6a4 4 0 0 0 3.6 3.6v1.8Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M13.5 22v-8h2.7l.4-3.1h-3.1V8.9c0-.9.3-1.5 1.6-1.5h1.7V4.6c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.1H7.5V14h2.6v8h3.4Z" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M23.5 7.1a3 3 0 0 0-2.1-2.1C19.5 4.5 12 4.5 12 4.5s-7.5 0-9.4.5A3 3 0 0 0 .5 7.1 31 31 0 0 0 0 12a31 31 0 0 0 .5 4.9A3 3 0 0 0 2.6 19c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-4.9ZM9.6 15.5v-7L16 12l-6.4 3.5Z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}
