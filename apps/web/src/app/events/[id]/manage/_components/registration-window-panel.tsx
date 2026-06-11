import type { EventDetailReadModel } from '@pickupvb/domain';
import { effectiveRegistrationClosesAt } from '@pickupvb/domain';
import { neutralButtonClass, textButtonClass } from '@/components/primary-button';
import { LocalDateTime } from '@/components/local-datetime';
import { formatEventDateLong } from '@/lib/date-formats';
import { setRegistrationOverrideAction } from '../../edit/registration-window-actions';

/**
 * Host "Close registration now / Reopen / Resume schedule" toggle. The
 * effective open/closed state is computed at the page boundary (no `new Date()`
 * in render) and passed as `registrationClosed`; this panel only chooses which
 * affordance to show. The buttons flip `events.registration_override`:
 *   - Close now → 'closed'   - Reopen → 'open'   - Resume schedule → null.
 */
export function RegistrationWindowPanel({
  event,
  registrationClosed,
}: {
  event: EventDetailReadModel;
  registrationClosed: boolean;
}) {
  const override = event.registrationOverride;
  const scheduledCloseAt = effectiveRegistrationClosesAt({
    startsAt: event.startsAt,
    registrationClosesAt: event.registrationClosesAt,
    registrationCloseOffsetMinutes: event.registrationCloseOffsetMinutes,
  });

  const statusLabel = registrationClosed
    ? override === 'closed'
      ? 'Closed — you closed it manually'
      : 'Closed — the registration window has passed'
    : override === 'open'
      ? 'Open — you reopened it manually'
      : 'Open';

  return (
    <div className="space-y-3">
      <p className="text-sm">
        Registration is <span className="font-semibold">{statusLabel}</span>
      </p>

      {scheduledCloseAt && override === null && (
        <p className="text-muted text-xs">
          Scheduled to close{' '}
          <LocalDateTime
            iso={scheduledCloseAt}
            variant="eventDateLong"
            timeZone={event.timeZone}
            fallback={formatEventDateLong(scheduledCloseAt, event.timeZone)}
          />
          .
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {registrationClosed ? (
          <form action={setRegistrationOverrideAction.bind(null, event.id, 'open')}>
            <button type="submit" className={neutralButtonClass('sm')}>
              Reopen registration
            </button>
          </form>
        ) : (
          <form action={setRegistrationOverrideAction.bind(null, event.id, 'closed')}>
            <button type="submit" className={neutralButtonClass('sm')}>
              Close registration now
            </button>
          </form>
        )}

        {override !== null && (
          <form action={setRegistrationOverrideAction.bind(null, event.id, null)}>
            <button type="submit" className={textButtonClass('sm')}>
              Resume scheduled window
            </button>
          </form>
        )}
      </div>

      <p className="text-muted text-xs">
        Closing registration stops new signups — it doesn’t cancel the event or notify attendees.
        Reopening keeps signups open until the event starts.
      </p>
    </div>
  );
}
