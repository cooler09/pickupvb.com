import Image from 'next/image';

type Props = {
  url: string | null;
  alt: string;
  /** Set true when the image is above the fold (event detail, group page). */
  priority?: boolean;
};

/**
 * Wide 3:1 banner image for events, groups, and profiles. Falls back to a
 * branded gradient when no URL is set so pages always have visual weight
 * at the top regardless of upload state.
 */
export function HeroImage({ url, alt, priority = false }: Props) {
  if (!url) {
    return (
      <div
        aria-hidden="true"
        className="from-primary/15 to-highlight/30 rounded-shape-md h-48 w-full bg-gradient-to-br"
      />
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
