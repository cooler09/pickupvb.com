'use client';

/**
 * Section 4 of the create-event form (architecture audit P3-1): the
 * format-dependent body. Open play → "Session details" ({@link OpenPlayBody});
 * tournament → "Divisions" ({@link DivisionsRepeater}); external → just the
 * external URL ({@link ExternalFields}). Pricing / payment-settings subsections
 * trail the body for on-platform open-play / tournament respectively. Owns the
 * derived `show*` flags so the orchestrator doesn't have to.
 */
import { useState, type Dispatch, type SetStateAction } from 'react';
import { EventPosition, EventType } from '@pickupvb/domain';
import { cardClass, cardSubClass, cardTitleClass, type CapacityKind } from './form-primitives';
import DivisionsRepeater, { anyDivisionPaidFromValues } from './divisions-repeater';
import ExternalFields from './external-fields';
import OpenPlayBody from './open-play-body';
import { PaymentSettingsSubsection, PricingSubsection } from './payment-fields';

export default function FormatSection({
  type,
  isExternal,
  capacityKind,
  setCapacityKind,
  positionCounts,
  setPositionCounts,
  positionTotal,
  fieldErrors,
  values,
  submitted,
  canCollectPayments,
  paymentsOffPlatform,
  setPaymentsOffPlatform,
  viewerHasProBenefits,
  atPaidEventCap,
}: {
  type: EventType;
  isExternal: boolean;
  capacityKind: CapacityKind;
  setCapacityKind: (v: CapacityKind) => void;
  positionCounts: Record<EventPosition, number>;
  setPositionCounts: Dispatch<SetStateAction<Record<EventPosition, number>>>;
  positionTotal: number;
  fieldErrors: Record<string, string> | undefined;
  values: Record<string, string> | undefined;
  submitted: boolean | undefined;
  canCollectPayments: boolean;
  paymentsOffPlatform: boolean;
  setPaymentsOffPlatform: (v: boolean) => void;
  viewerHasProBenefits: boolean;
  atPaidEventCap: boolean;
}) {
  const byPosition = capacityKind === 'by_position';
  const isLeague = type === EventType.League;
  // Per-division prices live in the divisions repeater; the payment-settings
  // subsection (a sibling) needs to know if any are non-zero so it can warn
  // a host without Stripe before they submit. The repeater reports changes up
  // via onPaidChange; seed the initial value from `values` so an applied
  // template with paid divisions is reflected on mount (CE-1).
  const [hasPaidDivision, setHasPaidDivision] = useState(() => anyDivisionPaidFromValues(values));
  const showPricing = !isExternal && type === EventType.OpenPlay;
  // Tournament and league divisions both collect their own per-division price
  // below; keep the event-level payment settings (refund window, fee
  // absorption) separate.
  const showPaymentSettings = !isExternal && (type === EventType.Tournament || isLeague);
  const showCapacity = type === EventType.OpenPlay && !isExternal;

  return (
    <>
      <section className={cardClass}>
        <div>
          <h2 className={cardTitleClass}>
            {isExternal
              ? 'External registration'
              : type === EventType.OpenPlay
                ? 'Session details'
                : 'Divisions'}
          </h2>
          <p className={cardSubClass}>
            {isExternal
              ? "Where players go to sign up. We'll link out from your event page."
              : type === EventType.OpenPlay
                ? 'Surface, skill level, how many spots, and what it costs.'
                : isLeague
                  ? 'Add each league division. Every division uses rostered teams — captains register an existing team for the season.'
                  : 'Add one or more divisions — each gets its own skill tier, capacity, and entry price.'}
          </p>
        </div>

        {isExternal ? (
          <ExternalFields type={type} fieldErrors={fieldErrors} values={values} />
        ) : type === EventType.OpenPlay ? (
          <OpenPlayBody
            capacityKind={capacityKind}
            setCapacityKind={setCapacityKind}
            byPosition={byPosition}
            positionCounts={positionCounts}
            setPositionCounts={setPositionCounts}
            positionTotal={positionTotal}
            fieldErrors={fieldErrors}
            values={values}
            submitted={submitted}
          />
        ) : (
          <>
            <DivisionsRepeater
              defaultSurface="indoor"
              requireAtLeastOne
              requireRoster={isLeague}
              onPaidChange={setHasPaidDivision}
              {...(values ? { initialValues: values } : {})}
              {...(fieldErrors ? { fieldErrors } : {})}
            />
          </>
        )}

        {showPricing && (
          <PricingSubsection
            fieldErrors={fieldErrors}
            values={values}
            submitted={submitted}
            canCollectPayments={canCollectPayments}
            paymentsOffPlatform={paymentsOffPlatform}
            setPaymentsOffPlatform={setPaymentsOffPlatform}
            viewerHasProBenefits={viewerHasProBenefits}
            atPaidEventCap={atPaidEventCap}
          />
        )}
        {showPaymentSettings && (
          <PaymentSettingsSubsection
            values={values}
            submitted={submitted}
            canCollectPayments={canCollectPayments}
            hasPaidDivision={hasPaidDivision}
            paymentsOffPlatform={paymentsOffPlatform}
            setPaymentsOffPlatform={setPaymentsOffPlatform}
            viewerHasProBenefits={viewerHasProBenefits}
            atPaidEventCap={atPaidEventCap}
          />
        )}
      </section>

      {/* Hidden fields the server action expects. Open play picks its
          format(s) via the multiselect in OpenPlayBody (submitted as
          `format_*` checkboxes; the first drives the division, 2+ advertise a
          multi-format session); gender stays implicit (coed). Tournaments
          surface format/gender inside the Division 1 card via TournamentBody. */}
      {showCapacity && byPosition && <input type="hidden" name="byPosition" value="on" />}
      {/* `capacityKind` is consumed by the server action; default to unlimited
          when by-position is selected (server ignores capacity in that mode). */}
      {showCapacity && (
        <input
          type="hidden"
          name="capacityKind"
          value={capacityKind === 'fixed' ? 'fixed' : 'unlimited'}
        />
      )}
    </>
  );
}
