import { LocalDateTime } from '@/components/local-datetime';

/** The two-column "When / Spots" summary on the event detail page. Leagues show
 *  a season date-range instead of a single start. Extracted from
 *  events/[id]/page.tsx (architecture audit P3-1). */
export function EventWhenSpotsSection({
  type,
  startsAt,
  endsAt,
  timeZone,
  spotsRemaining,
  attendeeCount,
  offPlatform,
  teamSummary,
}: {
  type: string;
  startsAt: Date;
  endsAt: Date;
  timeZone: string | null;
  spotsRemaining: number | null;
  attendeeCount: number;
  /**
   * True when registration (and/or payment) is handled off PickupVB — i.e.
   * `registrationMode === 'external'` or `paymentsOffPlatform`. The on-platform
   * attendee count is then empty/partial, so the live "N open · M signed up"
   * split would mislead; show the listed capacity as a plain total instead.
   */
  offPlatform: boolean;
  /**
   * Team-registration capacity for tournaments / leagues (EV-7). When set, the
   * right-hand cell is framed in **teams** rather than individual players (the
   * event-level player capacity is meaningless for team events). `cap` is the
   * summed team cap across divisions, or null when any team division is
   * uncapped; `reliable` is false for external events (on-platform registered
   * count is partial → show the cap alone). Null for individual-signup events.
   */
  teamSummary?: { registered: number; cap: number | null; reliable: boolean } | null;
}) {
  return (
    <section className="border-border-base rounded-shape-sm overflow-hidden border sm:grid sm:grid-cols-2">
      <div className="sm:border-border-base p-4 sm:border-r">
        {type === 'league' ? (
          // A league is a season, not a single gathering: show the season
          // window as a date range (no single start time) and point at the
          // weekly schedule rather than implying one continuous event.
          <>
            <h2 className="text-muted text-xs font-semibold tracking-wide uppercase">Season</h2>
            <p className="text-fg mt-1 font-medium">
              <LocalDateTime iso={startsAt} variant="dateShort" timeZone={timeZone} />
              {' – '}
              <LocalDateTime iso={endsAt} variant="dateShort" timeZone={timeZone} />
            </p>
            <p className="text-muted text-sm">Weekly schedule &amp; standings</p>
          </>
        ) : (
          <>
            <h2 className="text-muted text-xs font-semibold tracking-wide uppercase">When</h2>
            <p className="text-fg mt-1 font-medium">
              <LocalDateTime iso={startsAt} variant="eventDateLong" timeZone={timeZone} />
            </p>
            <p className="text-muted text-sm">
              to <LocalDateTime iso={endsAt} variant="eventDateLong" timeZone={timeZone} />
            </p>
          </>
        )}
      </div>
      <div className="border-border-base border-t p-4 sm:border-t-0 sm:border-l-0">
        <h2 className="text-muted text-xs font-semibold tracking-wide uppercase">
          {teamSummary ? 'Teams' : 'Spots'}
        </h2>
        {teamSummary ? (
          // Team-registration events (EV-7): show `registered / cap teams` when
          // every team division is capped, a plain registered count when not,
          // and (for external events, where the on-platform count is partial)
          // the cap alone — or "Unlimited" when uncapped.
          <p className="text-fg mt-1 font-medium">
            {teamSummary.cap !== null
              ? teamSummary.reliable
                ? `${teamSummary.registered} / ${teamSummary.cap} teams`
                : `${teamSummary.cap} teams`
              : teamSummary.reliable
                ? `${teamSummary.registered} ${teamSummary.registered === 1 ? 'team' : 'teams'}`
                : 'Unlimited'}
          </p>
        ) : spotsRemaining === null ? (
          <p className="text-fg mt-1 font-medium">Unlimited</p>
        ) : offPlatform ? (
          // `spotsRemaining + attendeeCount` is the configured capacity (the
          // on-platform count nets out), shown as a plain total so we don't
          // imply live availability the platform can't actually track here.
          <p className="text-fg mt-1 font-medium">{spotsRemaining + attendeeCount} spots</p>
        ) : (
          <p className="text-fg mt-1 font-medium">
            {spotsRemaining} open · <span className="text-muted">{attendeeCount} signed up</span>
          </p>
        )}
      </div>
    </section>
  );
}
