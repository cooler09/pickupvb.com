'use client';

import Link from 'next/link';
import { useFormState } from 'react-dom';
import { useState, useRef, useTransition } from 'react';
import { EVENT_POSITIONS, EventPosition, EventType } from '@pickupvb/domain';
import AddressAutocomplete, { type Suggestion } from '@/components/address-autocomplete';
import DateTimePicker from '@/components/datetime-picker';
import { FieldError, fieldA11y } from '@/components/field-error';
import { createEventAction, type CreateEventState } from './actions';
import { saveEventTemplateFromForm, deleteEventTemplate } from './template-actions';
import AdvancedDetailsPanel from '@/components/event-advanced-details-panel';
import DivisionsRepeater from './_components/divisions-repeater';
import {
  cardClass,
  cardSubClass,
  cardTitleClass,
  chk,
  inputClass,
  labelClass,
  SubmitButton,
  TypeCard,
  val,
  type CapacityKind,
} from './_components/form-primitives';
import OpenPlayBody from './_components/open-play-body';
import ExternalFields from './_components/external-fields';
import { PaymentSettingsSubsection, PricingSubsection } from './_components/payment-fields';

const initialState: CreateEventState = {};

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
}) {
  const [state, formAction] = useFormState(createEventAction, {
    ...initialState,
    ...(templateValues ? { values: templateValues } : {}),
  });
  const values = state.values;
  const submitted = state.submitted;
  const formRef = useRef<HTMLFormElement>(null);
  const templateNameRef = useRef<HTMLInputElement>(null);
  const [isSavingTemplate, startSaveTemplate] = useTransition();
  const [isDeletingTemplate, startDeleteTemplate] = useTransition();
  const [pickedTemplate, setPickedTemplate] = useState(selectedTemplateId ?? '');
  const [templateNameError, setTemplateNameError] = useState<string | null>(null);
  const [type, setType] = useState<EventType>(
    (val(values, 'type', EventType.OpenPlay) as EventType) || EventType.OpenPlay,
  );
  const [isExternal, setIsExternal] = useState(chk(values, submitted, 'isExternal', false));
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
  const byPosition = capacityKind === 'by_position';
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
  const hasAddress = addressLine.trim().length > 0;
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

  function applySuggestion(s: Suggestion) {
    setAddressLine(s.addressLine);
    setCity(s.city);
    setRegion(s.region);
    setPostalCode(s.postalCode);
    if (s.country) setCountry(s.country);
    setAddressOpen(true);
  }

  const showPricing = !isExternal && type === EventType.OpenPlay;
  // Tournament divisions collect their own per-division price below; keep the
  // event-level payment settings (refund window, fee absorption) separate.
  const showPaymentSettings = !isExternal && type === EventType.Tournament;
  const showCapacity = type === EventType.OpenPlay && !isExternal;

  return (
    <form ref={formRef} action={formAction} className="space-y-6 pb-24">
      {state.error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {state.error}
        </div>
      )}

      {viewerHasProBenefits ? (
        <section className={cardClass}>
          <h2 className={cardTitleClass}>Saved templates</h2>

          {/* Status feedback */}
          {templateStatus === 'saved' && (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
              Template saved.
            </div>
          )}
          {templateStatus === 'error' && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
              Could not save template.
            </div>
          )}

          {/* Apply an existing template */}
          {templates.length > 0 && (
            <div className="space-y-2">
              <p className={cardSubClass}>Apply a saved setup, then tweak before creating.</p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  id="template"
                  name="template"
                  value={pickedTemplate}
                  onChange={(e) => setPickedTemplate(e.target.value)}
                  className="border-border-base bg-surface text-fg focus:border-primary focus-visible:ring-primary rounded-md border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                >
                  <option value="">Choose saved template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  formAction="/events/new"
                  formMethod="get"
                  // The Apply button lives inside the main createEventAction form,
                  // which has `required` fields (title, etc.). Without
                  // formNoValidate the browser runs HTML5 constraint validation
                  // on submit and blocks the GET navigation when those fields
                  // are empty — which is the common case on a fresh /events/new.
                  formNoValidate
                  disabled={!pickedTemplate}
                  className="border-border-base text-fg hover:bg-fg/5 focus-visible:ring-primary rounded-md border px-3 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-40"
                >
                  Apply
                </button>
                {pickedTemplate && (
                  <button
                    type="button"
                    disabled={isDeletingTemplate}
                    onClick={() => {
                      startDeleteTemplate(async () => {
                        await deleteEventTemplate(pickedTemplate);
                      });
                    }}
                    className="text-muted hover:text-destructive focus-visible:ring-primary rounded text-sm focus:outline-none focus-visible:ring-2 disabled:opacity-60"
                  >
                    {isDeletingTemplate ? 'Removing…' : 'Remove'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Save current form as a new template */}
          <div className={templates.length > 0 ? 'border-border-base border-t pt-4' : ''}>
            <p className={`${cardSubClass} mb-2`}>Save current form as a template</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={templateNameRef}
                type="text"
                placeholder="Template name"
                className="border-border-base bg-surface text-fg focus:border-primary focus-visible:ring-primary w-44 rounded-md border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                onChange={() => setTemplateNameError(null)}
              />
              <button
                type="button"
                disabled={isSavingTemplate}
                onClick={() => {
                  const name = templateNameRef.current?.value.trim() ?? '';
                  if (!name) {
                    setTemplateNameError('Enter a name first.');
                    templateNameRef.current?.focus();
                    return;
                  }
                  setTemplateNameError(null);
                  const fd = formRef.current ? new FormData(formRef.current) : new FormData();
                  fd.set('templateName', name);
                  fd.delete('template');
                  startSaveTemplate(async () => {
                    await saveEventTemplateFromForm(fd);
                  });
                }}
                className="border-border-base text-fg hover:bg-fg/5 focus-visible:ring-primary rounded-md border px-3 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {isSavingTemplate ? 'Saving…' : 'Save template'}
              </button>
            </div>
            {templateNameError && (
              <p className="text-destructive mt-1 text-xs">{templateNameError}</p>
            )}
          </div>
        </section>
      ) : (
        <p className="text-muted text-sm">
          Save and reuse event templates with{' '}
          <Link href="/pricing" className="text-primary underline">
            Pro
          </Link>
          .
        </p>
      )}

      {/* ──────────────────────────────────────────────────────────────────
         1 — Event type
         Visual chooser + the external-registration promotion. Flipping
         either of these reshapes the rest of the form.
      ────────────────────────────────────────────────────────────────── */}
      <section className={cardClass}>
        <div>
          <h2 className={cardTitleClass}>What are you hosting?</h2>
          <p className={cardSubClass}>Pick how players will sign up.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TypeCard
            value={EventType.OpenPlay}
            current={type}
            title="Open play / pickup"
            description="Drop-in, individual signups, optional position roster."
            onChange={setType}
          />
          <TypeCard
            value={EventType.Tournament}
            current={type}
            title="Tournament"
            description="Bracketed competition, team signups, one or more divisions."
            onChange={setType}
          />
        </div>
        <label className="border-border-base bg-highlight/20 flex items-start gap-2 rounded-md border p-3 text-sm">
          <input
            type="checkbox"
            name="isExternal"
            checked={isExternal}
            onChange={(e) => setIsExternal(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="text-fg font-medium">Registration happens off-platform</span>
            <span className="text-muted block text-xs">
              For events run via AES, VolleyballLife, Eventbrite, etc. PickupVB will list the event
              and link to your registration page — no signups or payments collected here.
            </span>
          </span>
        </label>
      </section>

      {/* ──────────────────────────────────────────────────────────────────
         2 — Basics
      ────────────────────────────────────────────────────────────────── */}
      <section className={cardClass}>
        <div>
          <h2 className={cardTitleClass}>Basics</h2>
          <p className={cardSubClass}>Title and a quick description for the event card.</p>
        </div>
        <div>
          <label htmlFor="title" className={labelClass}>
            Title
          </label>
          <input
            id="title"
            name="title"
            required
            minLength={3}
            maxLength={120}
            defaultValue={val(values, 'title')}
            placeholder="Tuesday night open gym"
            className={inputClass}
            {...fieldA11y('title', state.fieldErrors)}
          />
          <FieldError name="title" errors={state.fieldErrors} />
        </div>
        <div>
          <label htmlFor="description" className={labelClass}>
            Description <span className="text-fg/50">(optional)</span>
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            maxLength={4000}
            defaultValue={val(values, 'description')}
            placeholder="Indoor 6's, all levels welcome. Bring kneepads — we'll rotate teams every set."
            className={inputClass}
            {...fieldA11y('description', state.fieldErrors)}
          />
          <FieldError name="description" errors={state.fieldErrors} />
        </div>
        <div>
          <label htmlFor="hostGroupId" className={labelClass}>
            Host as
          </label>
          <select
            id="hostGroupId"
            name="hostGroupId"
            defaultValue={val(values, 'hostGroupId', '')}
            className={inputClass}
          >
            <option value="">Yourself</option>
            {hostableGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <p className="text-muted mt-1 text-xs">
            Hosting on behalf of a group? Pick any group you own or admin.
          </p>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────
         3 — When & where
      ────────────────────────────────────────────────────────────────── */}
      <section className={cardClass}>
        <div>
          <h2 className={cardTitleClass}>When &amp; where</h2>
          <p className={cardSubClass}>Times and location. Address is geocoded on submit.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="startsAt" className={labelClass}>
              Starts at
            </label>
            <DateTimePicker
              name="startsAt"
              value={startsAt}
              onChange={setStartsAt}
              minDate={new Date()}
              inputClass={inputClass}
            />
            <FieldError name="startsAt" errors={state.fieldErrors} />
          </div>
          <div>
            <label htmlFor="endsAt" className={labelClass}>
              Ends at
            </label>
            <DateTimePicker
              name="endsAt"
              value={endsAt}
              onChange={setEndsAt}
              minDate={startsAt ?? new Date()}
              inputClass={inputClass}
            />
            <FieldError name="endsAt" errors={state.fieldErrors} />
          </div>
        </div>

        <div>
          <label htmlFor="addressSearch" className={labelClass}>
            Search address or venue
          </label>
          <AddressAutocomplete onPick={applySuggestion} inputClass={inputClass} />
          <p className="text-muted mt-1 text-xs">
            Pick a result to fill the fields below. You can edit them anytime.
          </p>
        </div>

        {/* Always render the address line; the rest collapse until needed. */}
        <div>
          <label htmlFor="addressLine" className={labelClass}>
            Address
          </label>
          <input
            id="addressLine"
            name="addressLine"
            required
            maxLength={200}
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value)}
            placeholder="123 Main St"
            className={inputClass}
            {...fieldA11y('location.addressLine', state.fieldErrors)}
          />
          <FieldError name="location.addressLine" errors={state.fieldErrors} />
        </div>

        {hasAddress && !addressOpen ? (
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <p className="text-muted">
              {[city, region, postalCode, country].filter(Boolean).join(', ') || (
                <span className="italic">Add city / region details</span>
              )}
            </p>
            <button
              type="button"
              onClick={() => setAddressOpen(true)}
              className="text-primary hover:underline"
            >
              Edit address details
            </button>
          </div>
        ) : null}

        {(addressOpen || !hasAddress) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="city" className={labelClass}>
                City
              </label>
              <input
                id="city"
                name="city"
                required
                maxLength={100}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={inputClass}
                {...fieldA11y('location.city', state.fieldErrors)}
              />
              <FieldError name="location.city" errors={state.fieldErrors} />
            </div>
            <div>
              <label htmlFor="region" className={labelClass}>
                State / region
              </label>
              <input
                id="region"
                name="region"
                maxLength={100}
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className={inputClass}
                {...fieldA11y('location.region', state.fieldErrors)}
              />
              <FieldError name="location.region" errors={state.fieldErrors} />
            </div>
            <div>
              <label htmlFor="postalCode" className={labelClass}>
                Postal code
              </label>
              <input
                id="postalCode"
                name="postalCode"
                maxLength={20}
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                className={inputClass}
                {...fieldA11y('location.postalCode', state.fieldErrors)}
              />
              <FieldError name="location.postalCode" errors={state.fieldErrors} />
            </div>
            <div>
              <label htmlFor="country" className={labelClass}>
                Country
              </label>
              <input
                id="country"
                name="country"
                required
                maxLength={100}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className={inputClass}
                {...fieldA11y('location.country', state.fieldErrors)}
              />
              <FieldError name="location.country" errors={state.fieldErrors} />
            </div>
          </div>
        )}
      </section>

      {/* ──────────────────────────────────────────────────────────────────
         4 — Format & divisions / Session details
         Open-play  → one "Session details" card (surface, skill, capacity,
                      pricing).
         Tournament → "Division 1" card (surface, format, gender, skill,
                      pricing) + DivisionsRepeater for additional divisions.
         External   → just the external URL + instructions (pricing &
                      capacity handled off-platform).
      ────────────────────────────────────────────────────────────────── */}
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
                : 'Add one or more divisions — each gets its own skill tier, capacity, and entry price.'}
          </p>
        </div>

        {isExternal ? (
          <ExternalFields type={type} fieldErrors={state.fieldErrors} values={values} />
        ) : type === EventType.OpenPlay ? (
          <OpenPlayBody
            capacityKind={capacityKind}
            setCapacityKind={setCapacityKind}
            byPosition={byPosition}
            positionCounts={positionCounts}
            setPositionCounts={setPositionCounts}
            positionTotal={positionTotal}
            fieldErrors={state.fieldErrors}
            values={values}
            submitted={submitted}
          />
        ) : (
          <>
            <DivisionsRepeater
              defaultSurface="indoor"
              requireAtLeastOne
              {...(state.fieldErrors ? { fieldErrors: state.fieldErrors } : {})}
            />
          </>
        )}

        {showPricing && (
          <PricingSubsection
            fieldErrors={state.fieldErrors}
            values={values}
            submitted={submitted}
            canCollectPayments={canCollectPayments}
            paymentsOffPlatform={paymentsOffPlatform}
            setPaymentsOffPlatform={setPaymentsOffPlatform}
            viewerHasProBenefits={viewerHasProBenefits}
          />
        )}
        {showPaymentSettings && (
          <PaymentSettingsSubsection
            values={values}
            submitted={submitted}
            canCollectPayments={canCollectPayments}
            paymentsOffPlatform={paymentsOffPlatform}
            setPaymentsOffPlatform={setPaymentsOffPlatform}
            viewerHasProBenefits={viewerHasProBenefits}
          />
        )}
      </section>

      {/* Hidden fields the server action expects. Top-level format/gender
          aren't part of the open-play UI but the schema accepts them as
          optional — for tournaments we surface them inside the Division 1
          card via TournamentBody. */}
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

      {/* ──────────────────────────────────────────────────────────────────
         5 — Advanced & visibility (collapsed)
         External-reg lives up top now; tell the panel to skip it.
      ────────────────────────────────────────────────────────────────── */}
      <section className={cardClass}>
        <div>
          <h2 className={cardTitleClass}>Visibility &amp; advanced details</h2>
          <p className={cardSubClass}>
            Most hosts can leave these as-is. Open if you need to restrict who sees the event, mark
            it as a series, fundraiser, or sanctioned event.
          </p>
        </div>
        <div>
          <label htmlFor="visibility" className={labelClass}>
            Who can see this event?
            {!viewerHasProBenefits && <span className="text-muted ml-1 text-xs">(Pro)</span>}
          </label>
          <select
            id="visibility"
            name="visibility"
            defaultValue={viewerHasProBenefits ? val(values, 'visibility', 'public') : 'public'}
            disabled={!viewerHasProBenefits}
            className={inputClass}
            {...fieldA11y('visibility', state.fieldErrors)}
          >
            <option value="public">Public — anyone can find it</option>
            <option value="invite_only">Invite only (unlisted — share by link)</option>
            <option value="friends_of_host">People the host follows</option>
            <option value="friends_of_attendees">People attendees follow</option>
          </select>
          <FieldError name="visibility" errors={state.fieldErrors} />
          {!viewerHasProBenefits && (
            <p className="text-muted mt-1 text-xs">
              Free events are public.{' '}
              <Link href="/pricing" className="text-primary hover:underline">
                Upgrade to Pro
              </Link>{' '}
              to host unlisted or friends-only events.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="rules" className={labelClass}>
            Rules <span className="text-fg/50">(optional)</span>
          </label>
          <textarea
            id="rules"
            name="rules"
            rows={2}
            maxLength={4000}
            defaultValue={val(values, 'rules')}
            placeholder="Rally scoring to 25, win by 2. Captain's choice on lets."
            className={inputClass}
            {...fieldA11y('rules', state.fieldErrors)}
          />
          <FieldError name="rules" errors={state.fieldErrors} />
        </div>
        <AdvancedDetailsPanel hideExternal isExternal={isExternal} />
      </section>

      {/* ──────────────────────────────────────────────────────────────────
         Sticky footer — keeps the primary CTA reachable on long forms.
      ────────────────────────────────────────────────────────────────── */}
      <div className="border-border-base bg-surface/95 fixed inset-x-0 bottom-0 z-10 border-t backdrop-blur sm:static sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
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
