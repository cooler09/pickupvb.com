import Image from 'next/image';
import { DefaultCourtArt } from './default-court-art';

type Props = {
  url: string | null;
  alt: string;
  /** Set true when the image is above the fold (event detail, group page). */
  priority?: boolean;
  /**
   * Event surface (`sand` | `grass` | `indoor`). When set and no uploaded
   * image exists, the default banner paints a surface-tinted volleyball court
   * so the fallback signals the playing surface at a glance — the same motif
   * the event cards use. Omit for groups/profiles to get the neutral brand
   * court.
   */
  surface?: string | null;
};

/**
 * Wide 3:1 banner image for events, groups, and profiles. Falls back to a
 * branded, surface-aware volleyball court ({@link DefaultCourtArt}) when no URL
 * is set so pages always have visual weight at the top regardless of upload
 * state.
 */
export function HeroImage({ url, alt, priority = false, surface }: Props) {
  if (!url) {
    return (
      <div className="rounded-shape-md relative h-48 w-full overflow-hidden">
        <DefaultCourtArt surface={surface} animated />
      </div>
    );
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
