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
  /** Primary division SkillTier — preferred over `skillLevel` when present. */
  skillTier?: string | null;
  /** Optional override label from the division row. */
  tierLabel?: string | null;
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
  /** Number of divisions; passed through to EventTags. */
  divisionCount?: number;
  /**
   * Whether registration closes within 72 hours. Computed by the parent
   * page at the request boundary (server components only) so the hero
   * itself stays free of impure clock reads — the React Compiler purity
   * rule rejects `Date.now()` inside render.
   */
  closingSoon?: boolean;
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
  skillTier,
  tierLabel,
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
  divisionCount,
  closingSoon = false,
}: Props) {
  return (
    <header className="space-y-2">
      {/* Row 1 — tags on the left, secondary actions on the right.
          Pairing them frees a vertical block and right-anchors the
          host's Edit link out of the primary read path. */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <EventTags
          type={type}
          surface={surface}
          skillLevel={skillLevel}
          {...(skillTier !== undefined ? { skillTier } : {})}
          {...(tierLabel !== undefined ? { tierLabel } : {})}
          format={format}
          gender={gender}
          status={status}
          {...(divisionCount !== undefined ? { divisionCount } : {})}
        />
        <div className="flex shrink-0 items-center gap-3 text-sm">
          <EventShareLink shortCode={shortCode} title={title} />
          {canManage && (
            <Link
              href={`/events/${eventId}/edit` as Route}
              className="text-primary hover:underline"
            >
              Edit
            </Link>
          )}
        </div>
      </div>

      <h1 className="text-fg text-3xl font-bold">{title}</h1>

      {/* Row 3 — meta sub-line. Date and location are the two highest-
          signal facts; spots and the closing-soon pill ride along when
          present. Price moved into the CTA row to declutter. */}
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
        {closingSoon && registrationClosesAt !== null && (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900"
            aria-label="Registration closing soon"
          >
            <span aria-hidden="true">⏳</span>
            Closes{' '}
            <LocalDateTime
              iso={registrationClosesAt!}
              variant="dateShort"
              timeZone={timeZone}
              fallback={formatEventDateLong(registrationClosesAt!, timeZone)}
            />
          </span>
        )}
      </p>

      {/* Row 4 — primary action paired with the price chip. Always
          render the chip so free vs paid is unambiguous at a glance. */}
      {(cta || priceLabel) && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {cta?.kind === 'internal' && (
            <Link
              href={cta.href}
              className="bg-primary text-primary-fg hover:bg-primary/90 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold"
            >
              {cta.label}
            </Link>
          )}
          {cta?.kind === 'anchor' && (
            <a
              href={cta.hash}
              className="bg-primary text-primary-fg hover:bg-primary/90 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold"
            >
              {cta.label}
            </a>
          )}
          {cta?.kind === 'external' && (
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
          {priceLabel && (
            <span className="text-fg bg-fg/5 rounded-full px-2.5 py-1 text-sm font-medium">
              {priceLabel}
            </span>
          )}
        </div>
      )}
    </header>
  );
}
