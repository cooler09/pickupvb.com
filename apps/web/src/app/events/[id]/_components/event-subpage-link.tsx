import Link from 'next/link';
import type { Route } from 'next';
import { primaryButtonClass } from '@/components/primary-button';

/** A bordered card linking to an event sub-page (bracket / schedule). DRYs the
 *  two near-identical cards on the event detail page (architecture audit P3-1). */
export function EventSubpageLink({
  title,
  description,
  href,
  ctaLabel,
}: {
  title: string;
  description: string;
  /** An event sub-route, e.g. `/events/{id}/bracket`. Cast to `Route` here so
   *  callers can pass a plain template literal. */
  href: string;
  ctaLabel: string;
}) {
  return (
    <section className="border-border-base bg-fg/5 rounded-shape-sm border p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-fg text-base font-semibold">{title}</h2>
          <p className="text-muted text-xs">{description}</p>
        </div>
        <Link href={href as Route} className={primaryButtonClass()}>
          {ctaLabel}
        </Link>
      </div>
    </section>
  );
}
