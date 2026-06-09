'use client';

import Link from 'next/link';
import { useFormState } from 'react-dom';
import { useRef, useState } from 'react';
import { EVENT_POSITIONS, EventPosition, EventType } from '@pickupvb/domain';
import type { Suggestion } from '@/components/address-autocomplete';
import { ErrorActionLink } from '@/components/error-action-link';
import { Alert } from '@/components/alert';
import { useAlertReveal } from '@/components/use-alert-reveal';
import { createEventAction, type CreateEventState } from './actions';
import { chk, SubmitButton, val, type CapacityKind } from './_components/form-primitives';
import TemplatesSection from './_components/templates-section';
import EventTypeSection from './_components/event-type-section';
import BasicsSection from './_components/basics-section';
import WhenWhereSection from './_components/when-where-section';
import FormatSection from './_components/format-section';
import VisibilitySection from './_components/visibility-section';

const initialState: CreateEventState = {};

/** Default event length when auto-filling the end time from a picked start. */
const DEFAULT_EVENT_DURATION_MS = 2 * 60 * 60 * 1000;

/** Sensible defaults for indoor 6's: 1 setter, 2 outsides, 1 opposite, 2 middles, 1 libero. */
const DEFAULT_POSITION_ROSTER: Record<EventPosition, number> = {
  [EventPosition.Setter]: 1,
  [EventPosition.Outside]: 2,
  [EventPosition.Opposite]: 1,
  [EventPosition.Middle]: 2,
  [EventPosition.Libero]: 1,
  [EventPosition.DefensiveSpecialist]: 0,
};

export default function NewEventForm({
  hostableGroups = [],
  canCollectPayments = false,
  templates = [],
  selectedTemplateId,
  templateValues,
  templateStatus,
  viewerHasProBenefits,
  atPaidEventCap = false,
}: {
  hostableGroups?: { id: string; name: string }[];
  /**
   * True when the host has a Stripe Connect account with
   * `charges_enabled`. When false, the form hides on-platform payment
   * controls and forces off-platform mode, with a banner pointing to
   * `/profile/billing` to finish onboarding.
   */
  canCollectPayments?: boolean;
  templates?: { id: string; name: string }[];
  selectedTemplateId?: string;
  templateValues?: Record<string, string>;
  templateStatus?: string;
  viewerHasProBenefits: boolean;
  /**
   * True when a free host has already used their rolling-30d paid-event
   * allowance. Surfaced contextually inside the pricing section once a price is
   * entered, rather than as an always-on banner at the top of the form (CE-10).
   */
  atPaidEventCap?: boolean;
}) {
  const [state, formAction] = useFormState(createEventAction, {
    ...initialState,
    ...(templateValues ? { values: templateValues } : {}),
  });
  const values = state.values;
  const submitted = state.submitted;
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useAlertReveal(state, Boolean(state.error));
  const [type, setType] = useState<EventType>(
    (val(values, 'type', EventType.OpenPlay) as EventType) || EventType.OpenPlay,
  );
  const [isExternal, setIsExternal] = useState(chk(values, submitted, 'isExternal', false));
  // Leagues are on-platform only (managed schedule / scoring / rosters), so
  // clear any off-platform selection when switching into League. The
  // EventTypeSection also hides the toggle and the create action rejects the
  // combination defensively.
  function handleSetType(next: EventType) {
    setType(next);
    if (next === EventType.League) setIsExternal(false);
  }
  // The off-platform checkbox is always user-controlled (state lifted to
  // the parent so it survives switching between OpenPlay and Tournament
  // sections). When the host has no Stripe Connect account we still show
  // the toggle alongside a `StripeOnboardingBanner` so they can either
  // (a) explicitly opt into off-platform collection or (b) finish
  // Stripe onboarding before continuing. The server-side gate in
  // `actions.ts` (`requireHostChargesEnabled`) rejects paid + on-platform
  // submissions without Stripe so the host can't sneak past.
  const [paymentsOffPlatform, setPaymentsOffPlatform] = useState(() =>
    chk(values, submitted, 'paymentsOffPlatform', false),
  );

  // Capacity is a single 3-way selector now (Unlimited / Fixed / By position).
  // It's only meaningful for open-play, on-platform events.
  const [capacityKind, setCapacityKind] = useState<CapacityKind>(() => {
    if (chk(values, submitted, 'byPosition', false)) return 'by_position';
    const raw = val(values, 'capacityKind', 'unlimited');
    return raw === 'fixed' ? 'fixed' : 'unlimited';
  });
  const [positionCounts, setPositionCounts] = useState<Record<EventPosition, number>>(() => {
    if (!submitted) return DEFAULT_POSITION_ROSTER;
    const out = { ...DEFAULT_POSITION_ROSTER };
    for (const pos of EVENT_POSITIONS) {
      const raw = values?.[`position_${pos}`];
      if (raw !== undefined) out[pos] = Math.max(0, Math.floor(Number(raw) || 0));
    }
    return out;
  });
  const positionTotal = Object.values(positionCounts).reduce((a, b) => a + b, 0);

  // Address (autocomplete fills these; user can edit any of them).
  const [addressLine, setAddressLine] = useState(val(values, 'addressLine', ''));
  const [city, setCity] = useState(val(values, 'city', ''));
  const [region, setRegion] = useState(val(values, 'region', ''));
  const [postalCode, setPostalCode] = useState(val(values, 'postalCode', ''));
  const [country, setCountry] = useState(val(values, 'country', 'USA'));
  const [addressOpen, setAddressOpen] = useState(false);

  const [startsAt, setStartsAt] = useState<Date | null>(() => {
    const raw = values?.startsAt;
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  });
  const [endsAt, setEndsAt] = useState<Date | null>(() => {
    const raw = values?.endsAt;
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  });

  // Default the end time to start + 2h when a start is picked. Only fills when
  // the end is unset or no longer after the new start, so an explicitly-set
  // later end time is preserved (and an invalid end is auto-corrected).
  function handleStartsAtChange(next: Date | null) {
    setStartsAt(next);
    if (next) {
      setEndsAt((prev) =>
        prev && prev.getTime() > next.getTime()
          ? prev
          : new Date(next.getTime() + DEFAULT_EVENT_DURATION_MS),
      );
    }
  }

  function applySuggestion(s: Suggestion) {
    setAddressLine(s.addressLine);
    setCity(s.city);
    setRegion(s.region);
    setPostalCode(s.postalCode);
    if (s.country) setCountry(s.country);
    setAddressOpen(true);
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-6 pb-24">
      {state.error && (
        <div ref={errorRef} tabIndex={-1} className="outline-none">
          <Alert variant="error">
            {state.error}
            <ErrorActionLink action={state.errorAction} />
          </Alert>
        </div>
      )}

      <TemplatesSection
        templates={templates}
        {...(selectedTemplateId ? { selectedTemplateId } : {})}
        {...(templateStatus ? { templateStatus } : {})}
        viewerHasProBenefits={viewerHasProBenefits}
        formRef={formRef}
      />

      <EventTypeSection
        type={type}
        setType={handleSetType}
        isExternal={isExternal}
        setIsExternal={setIsExternal}
      />

      <BasicsSection
        fieldErrors={state.fieldErrors}
        values={values}
        hostableGroups={hostableGroups}
      />

      <WhenWhereSection
        startsAt={startsAt}
        setStartsAt={handleStartsAtChange}
        endsAt={endsAt}
        setEndsAt={setEndsAt}
        addressLine={addressLine}
        setAddressLine={setAddressLine}
        city={city}
        setCity={setCity}
        region={region}
        setRegion={setRegion}
        postalCode={postalCode}
        setPostalCode={setPostalCode}
        country={country}
        setCountry={setCountry}
        onPick={applySuggestion}
        addressOpen={addressOpen}
        setAddressOpen={setAddressOpen}
        fieldErrors={state.fieldErrors}
      />

      <FormatSection
        type={type}
        isExternal={isExternal}
        capacityKind={capacityKind}
        setCapacityKind={setCapacityKind}
        positionCounts={positionCounts}
        setPositionCounts={setPositionCounts}
        positionTotal={positionTotal}
        fieldErrors={state.fieldErrors}
        values={values}
        submitted={submitted}
        canCollectPayments={canCollectPayments}
        paymentsOffPlatform={paymentsOffPlatform}
        setPaymentsOffPlatform={setPaymentsOffPlatform}
        viewerHasProBenefits={viewerHasProBenefits}
        atPaidEventCap={atPaidEventCap}
      />

      <VisibilitySection
        fieldErrors={state.fieldErrors}
        values={values}
        viewerHasProBenefits={viewerHasProBenefits}
        isExternal={isExternal}
      />

      {/* ──────────────────────────────────────────────────────────────────
         Sticky footer — keeps the primary CTA reachable on long forms.
      ────────────────────────────────────────────────────────────────── */}
      <div className="border-border-base bg-md-surface-container/95 fixed inset-x-0 bottom-0 z-10 border-t backdrop-blur sm:static sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3 sm:px-0">
          <Link href="/events" className="text-muted hover:text-primary text-sm">
            Cancel
          </Link>
          <SubmitButton />
        </div>
      </div>
    </form>
  );
}
