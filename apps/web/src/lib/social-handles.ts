/**
 * Profile social-media fields. Persisted as bare handles (no leading "@",
 * no URL prefix) — except `websiteUrl`, which stores the full URL.
 */
export type SocialHandles = {
  instagramHandle: string | null;
  tiktokHandle: string | null;
  twitterHandle: string | null;
  facebookHandle: string | null;
  youtubeHandle: string | null;
  websiteUrl: string | null;
};

/**
 * Strip whitespace, a leading "@", and common platform URL prefixes so we
 * persist just the handle. Returns null for empty/blank input.
 */
export function normalizeHandle(raw: string | null | undefined, maxLen: number): string | null {
  if (!raw) return null;
  let v = raw.trim();
  if (!v) return null;
  // Strip protocol + host if user pasted a full URL.
  v = v.replace(
    /^https?:\/\/(www\.)?(instagram\.com|tiktok\.com|twitter\.com|x\.com|facebook\.com|youtube\.com|youtu\.be)\//i,
    '',
  );
  // TikTok URLs include a leading @ in the path.
  v = v.replace(/^@/, '');
  // Drop trailing slash + querystring.
  v = v.split(/[?#]/)[0]!.replace(/\/$/, '');
  if (!v) return null;
  return v.slice(0, maxLen);
}

/**
 * Normalize a website URL: trim, prepend https:// if missing, validate via
 * URL constructor. Returns null on empty/invalid input.
 */
export function normalizeWebsiteUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString().slice(0, 200);
  } catch {
    return null;
  }
}

/** Build the public URL for a given platform handle. */
export function socialUrl(
  platform: keyof Omit<SocialHandles, 'websiteUrl'>,
  handle: string,
): string {
  switch (platform) {
    case 'instagramHandle':
      return `https://instagram.com/${handle}`;
    case 'tiktokHandle':
      return `https://tiktok.com/@${handle}`;
    case 'twitterHandle':
      return `https://x.com/${handle}`;
    case 'facebookHandle':
      return `https://facebook.com/${handle}`;
    case 'youtubeHandle':
      // YouTube handles start with @ in URLs; channel IDs/legacy paths
      // don't. Preserve user's stored form (handle/channel/user/c) by
      // adding @ only when it doesn't already include a path segment.
      return handle.includes('/')
        ? `https://youtube.com/${handle}`
        : `https://youtube.com/@${handle}`;
  }
}
