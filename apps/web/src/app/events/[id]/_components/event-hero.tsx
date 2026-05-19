import Link from 'next/link';
import type { Route } from 'next';
import { LocalDateTime } from '@/components/local-datetime';
import { formatEventDateLong } from '@/lib/date-formats';
import { EventTags } from './event-tags';
import { EventShareLink } from './event-share-link';

export type EventHeroCta =
  | { kind: 'internal'; href: Route; label: string; emphasis?: boolean }
  | { kind: 'anchor'; hash: `#${string}`; label: string; emphasis?: boolean }
  | { kind: 'external'; href: string; label: string; emphasis?: boolean }
  | null;

type Props = {
  eventId: string;
  shortCode: string;
  title: string;
  type: string;
  surface: string;
  skillLevel: string;
  format: string | null;
  gender: string | null;
  status: string;
  startsAt: Date;
  timeZone: string | null;
  city: string;
  region: string;
  spotsRemaining: number | null;
  priceLabel: string;
  registrationClosesAt: Date | null;
  canManage: boolean;
  cta: EventHeroCta;
};

/**
 * Above-the-fold summary: tags, title, primary CTA, secondary actions, and
 * a one-line meta sub-line. The full panels (RSVP, paid ticket, tournament
 * registration) still render below — the CTA simply scrolls to them.
 */
export function EventHero({
  eventId,
  shortCode,
  title,
  type,
  surface,
  skillLevel,
  format,
  gender,
  status,
  startsAt,
  timeZone,
  city,
  region,
  spotsRemaining,
  priceLabel,
  registrationClosesAt,
  canManage,
  cta,
}: Props) {
  // Surface a closing-soon countdown when the registration deadline is
  // within 72 hours. Done in user-local time on the client; SSR shows the
  // long-form fallback so the SEO meta still resolves.
  const now = Date.now();
  const closesAtMs = registrationClosesAt ? registrationClosesAt.getTime() : null;
  const closingSoon =
    closesAtMs !== null && closesAtMs > now && closesAtMs - now <= 72 * 60 * 60 * 1000;

  return (
    <header className="space-y-3">
      <EventTags
        type={type}
        surface={surface}
        skillLevel={skillLevel}
        format={format}
        gender={gender}
        status={status}
      />
      <h1 className="text-fg text-3xl font-bold">{title}</h1>
      <p className="text-muted flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <LocalDateTime
          iso={startsAt}
          variant="dateShort"
          timeZone={timeZone}
          fallback={formatEventDateLong(startsAt, timeZone)}
        />
        <span aria-hidden="true">·</span>
        <span>
          {city}, {region}
        </span>
        {spotsRemaining !== null && (
          <>
            <span aria-hidden="true">·</span>
            <span>
              {spotsRemaining === 0
                ? 'Full'
                : `${spotsRemaining} ${spotsRemaining === 1 ? 'spot' : 'spots'} left`}
            </span>
          </>
        )}
        <span aria-hidden="true">·</span>
        <span className="text-fg font-medium">{priceLabel}</span>
      </p>
      {closingSoon && closesAtMs !== null && (
        <p
          className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900"
          aria-label="Registration closing soon"
        >
          <span aria-hidden="true">⏳</span>
          Registration closes{' '}
          <LocalDateTime
            iso={registrationClosesAt!}
            variant="dateShort"
            timeZone={timeZone}
            fallback={formatEventDateLong(registrationClosesAt!, timeZone)}
          />
        </p>
      )}
      {cta && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {cta.kind === 'internal' && (
            <Link
              href={cta.href}
              className="bg-primary text-primary-fg hover:bg-primary/90 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold"
            >
              {cta.label}
            </Link>
          )}
          {cta.kind === 'anchor' && (
            <a
              href={cta.hash}
              className="bg-primary text-primary-fg hover:bg-primary/90 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold"
            >
              {cta.label}
            </a>
          )}
          {cta.kind === 'external' && (
            <a
              href={cta.href}
              target="_blank"
              rel="noreferrer"
              className="bg-primary text-primary-fg hover:bg-primary/90 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold"
            >
              {cta.label} <span aria-hidden="true">↗</span>
              <span className="sr-only"> (opens in new tab)</span>
            </a>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <EventShareLink shortCode={shortCode} title={title} />
        {canManage && (
          <Link href={`/events/${eventId}/edit` as Route} className="text-primary hover:underline">
            Edit event
          </Link>
        )}
      </div>
    </header>
  );
}
