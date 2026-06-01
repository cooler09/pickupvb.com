import Image from 'next/image';

type Props = {
  url: string | null;
  alt: string;
  /** Set true when the image is above the fold (event detail, group page). */
  priority?: boolean;
  /**
   * Event surface (`sand` | `grass` | `indoor`). When set and no uploaded
   * image exists, the default banner paints a surface-tinted volleyball court
   * so the fallback signals the playing surface at a glance — mirroring the
   * card placeholders (`SURFACE_TINT` in `events/_components/event-card.tsx`).
   * Omit for groups/profiles to get the neutral brand court.
   */
  surface?: string | null;
};

/**
 * Surface-keyed gradient for the default court. Mirrors the card's
 * `SURFACE_TINT` but as a richer multi-stop gradient for the wide banner.
 */
const SURFACE_GRADIENT: Record<string, string> = {
  sand: 'from-amber-200 via-orange-100 to-amber-300',
  grass: 'from-emerald-200 via-green-100 to-green-300',
  indoor: 'from-sky-200 via-cyan-100 to-blue-200',
};

/** Neutral brand court — used for groups/profiles and unknown surfaces. */
const BRAND_GRADIENT = 'from-primary/20 via-highlight/25 to-primary/10';

/**
 * Decorative default banner: a top-down volleyball court (boundary, center
 * net line, dashed attack lines) over a surface-tinted gradient, with a
 * translucent ball offset to the right. Pure inline SVG — no asset, no
 * network — so it scales to any width and never 404s.
 */
function DefaultHeroArt({ surface }: { surface: string | null | undefined }) {
  const gradient = (surface && SURFACE_GRADIENT[surface]) || BRAND_GRADIENT;
  return (
    <div
      aria-hidden="true"
      className={`rounded-shape-md relative h-48 w-full overflow-hidden bg-gradient-to-br ${gradient}`}
    >
      {/* Court markings — stretched to fill the banner; white lines read as
          real court tape over the surface tint. */}
      <svg
        className="absolute inset-0 h-full w-full text-white/55"
        viewBox="0 0 360 120"
        preserveAspectRatio="none"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      >
        <rect x="18" y="14" width="324" height="92" rx="2" />
        <line x1="180" y1="14" x2="180" y2="106" />
        <line x1="120" y1="14" x2="120" y2="106" strokeDasharray="4 5" />
        <line x1="240" y1="14" x2="240" y2="106" strokeDasharray="4 5" />
      </svg>
      {/* Volleyball — same glyph as the card thumbnail, enlarged and offset.
          Kept dark and faint so it sits behind the court tape as a motif. */}
      <svg
        className="text-fg/12 absolute top-1/2 right-6 h-28 w-28 -translate-y-1/2"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.75"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 1 6.5 15.2M12 3a9 9 0 0 0-6.5 15.2M3.6 9.4A9 9 0 0 1 20.4 13.6" />
      </svg>
    </div>
  );
}

/**
 * Wide 3:1 banner image for events, groups, and profiles. Falls back to a
 * branded, surface-aware volleyball court when no URL is set so pages always
 * have visual weight at the top regardless of upload state.
 */
export function HeroImage({ url, alt, priority = false, surface }: Props) {
  if (!url) {
    return <DefaultHeroArt surface={surface} />;
  }
  return (
    <div className="rounded-shape-md relative h-48 w-full overflow-hidden">
      <Image
        src={url}
        alt={alt}
        fill
        className="object-cover"
        sizes="(max-width: 768px) 100vw, 768px"
        {...(priority ? { priority: true } : {})}
      />
    </div>
  );
}
