import Image from 'next/image';

type EventBadge = {
  id: string;
  label: string;
  description: string | null;
  iconUrl: string | null;
};

/**
 * "Badges you can earn here" — the discovery/FOMO teaser on the public event
 * page (gamification Phase 2). Lists the host's collectible badges so attendees
 * know there's something to collect by showing up. Renders nothing when the
 * event has no badges. Presentational + server-safe.
 */
export function EventBadgesEarnSection({ badges }: { badges: EventBadge[] }) {
  if (badges.length === 0) return null;

  return (
    <section className="border-border-base bg-md-surface-container rounded-shape-sm border p-4">
      <p className="text-muted text-xs font-semibold tracking-wide uppercase">
        Badges you can earn here
      </p>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-4">
        {badges.map((b) => (
          <li
            key={b.id}
            className="flex w-24 flex-col items-center gap-1.5 text-center"
            title={b.description ?? b.label}
          >
            <span className="ring-primary/40 bg-primary/10 text-primary flex h-12 w-12 items-center justify-center overflow-hidden rounded-full ring-2">
              {b.iconUrl ? (
                <Image
                  src={b.iconUrl}
                  alt=""
                  width={48}
                  height={48}
                  unoptimized
                  aria-hidden
                  className="h-full w-full object-cover"
                />
              ) : (
                <span aria-hidden className="text-base font-bold">
                  ★
                </span>
              )}
            </span>
            <span className="text-fg line-clamp-2 text-xs font-semibold">{b.label}</span>
          </li>
        ))}
      </ul>
      <p className="text-muted mt-3 text-xs">Play in this event to add them to your collection.</p>
    </section>
  );
}
