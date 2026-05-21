'use client';

import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { EVENT_POSITIONS, EventPosition, EventType } from '@pickupvb/domain';
import AddressAutocomplete, { type Suggestion } from '@/components/address-autocomplete';
import DateTimePicker from '@/components/datetime-picker';
import { POSITION_LABEL } from '@/lib/enum-labels';
import { createEventAction, type CreateEventState } from './actions';
import AdvancedDetailsPanel from '@/components/event-advanced-details-panel';
import DivisionsRepeater from './_components/divisions-repeater';

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

type CapacityKind = 'unlimited' | 'fixed' | 'by_position';

const labelClass = 'block text-sm font-medium text-fg';
const inputClass =
  'mt-1 block w-full rounded-md border border-border-base bg-surface px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary';
const errorClass = 'mt-1 text-xs text-red-600';
const cardClass = 'border-border-base bg-surface space-y-5 rounded-lg border p-5 sm:p-6';
const cardTitleClass = 'text-fg text-base font-semibold';
const cardSubClass = 'text-muted text-sm';

function FieldError({
  name,
  errors,
}: {
  name: string;
  errors: Record<string, string> | undefined;
}) {
  const msg = errors?.[name];
  if (!msg) return null;
  return <p className={errorClass}>{msg}</p>;
}

// Renders the SkillTier ladder used by every division (incl. the implicit
// division #1 that the top-level form represents). Grouped by SkillBand so
// the labels still line up with the legacy band buckets.
function SkillTierSelect({ fieldErrors }: { fieldErrors: Record<string, string> | undefined }) {
  return (
    <div>
      <label htmlFor="skillTier" className={labelClass}>
        Skill tier
      </label>
      <select id="skillTier" name="skillTier" defaultValue="bb" className={inputClass}>
        <optgroup label="Beginner">
          <option value="c">C</option>
          <option value="b">B</option>
        </optgroup>
        <optgroup label="Intermediate">
          <option value="bb">BB</option>
          <option value="bb3">BB-3</option>
        </optgroup>
        <optgroup label="Advanced">
          <option value="a">A</option>
        </optgroup>
        <optgroup label="Competitive">
          <option value="aa">AA</option>
          <option value="open">Open</option>
        </optgroup>
      </select>
      <FieldError name="skillLevel" errors={fieldErrors} />
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-primary hover:bg-primary/90 rounded-md px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
    >
      {pending ? 'Creating…' : 'Create event'}
    </button>
  );
}

function TypeCard({
  value,
  current,
  title,
  description,
  onChange,
}: {
  value: EventType;
  current: EventType;
  title: string;
  description: string;
  onChange: (v: EventType) => void;
}) {
  const checked = value === current;
  return (
    <label
      className={`block cursor-pointer rounded-lg border p-4 transition-colors ${
        checked
          ? 'border-primary bg-primary/5 ring-primary/30 ring-2'
          : 'border-border-base hover:bg-fg/5'
      }`}
    >
      <input
        type="radio"
        name="type"
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      <div className="text-fg text-sm font-semibold">{title}</div>
      <div className="text-muted mt-1 text-xs">{description}</div>
    </label>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="border-border-base bg-fg/5 inline-flex flex-wrap rounded-md border p-0.5 text-sm"
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`rounded px-3 py-1.5 transition-colors ${
              active ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function NewEventForm({
  hostableGroups = [],
}: {
  hostableGroups?: { id: string; name: string }[];
}) {
  const [state, formAction] = useFormState(createEventAction, initialState);
  const [type, setType] = useState<EventType>(EventType.OpenPlay);
  const [isExternal, setIsExternal] = useState(false);

  // Capacity is a single 3-way selector now (Unlimited / Fixed / By position).
  // It's only meaningful for open-play, on-platform events.
  const [capacityKind, setCapacityKind] = useState<CapacityKind>('unlimited');
  const byPosition = capacityKind === 'by_position';
  const [positionCounts, setPositionCounts] =
    useState<Record<EventPosition, number>>(DEFAULT_POSITION_ROSTER);
  const positionTotal = Object.values(positionCounts).reduce((a, b) => a + b, 0);

  // Address (autocomplete fills these; user can edit any of them).
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('USA');
  const hasAddress = addressLine.trim().length > 0;
  const [addressOpen, setAddressOpen] = useState(false);

  const [startsAt, setStartsAt] = useState<Date | null>(null);
  const [endsAt, setEndsAt] = useState<Date | null>(null);

  function applySuggestion(s: Suggestion) {
    setAddressLine(s.addressLine);
    setCity(s.city);
    setRegion(s.region);
    setPostalCode(s.postalCode);
    if (s.country) setCountry(s.country);
    setAddressOpen(true);
  }

  const showPricing = !isExternal;
  const showCapacity = type === EventType.OpenPlay && !isExternal;

  return (
    <form action={formAction} className="space-y-6 pb-24">
      {state.error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {state.error}
        </div>
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
            placeholder="Tuesday night open gym"
            className={inputClass}
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
            placeholder="Indoor 6's, all levels welcome. Bring kneepads — we'll rotate teams every set."
            className={inputClass}
          />
          <FieldError name="description" errors={state.fieldErrors} />
        </div>
        <div>
          <label htmlFor="hostGroupId" className={labelClass}>
            Host as
          </label>
          <select id="hostGroupId" name="hostGroupId" defaultValue="" className={inputClass}>
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
                : 'Set up your first division — add more below for multi-format or multi-skill events.'}
          </p>
        </div>

        {isExternal ? (
          <ExternalFields type={type} fieldErrors={state.fieldErrors} />
        ) : type === EventType.OpenPlay ? (
          <OpenPlayBody
            capacityKind={capacityKind}
            setCapacityKind={setCapacityKind}
            byPosition={byPosition}
            positionCounts={positionCounts}
            setPositionCounts={setPositionCounts}
            positionTotal={positionTotal}
            fieldErrors={state.fieldErrors}
          />
        ) : (
          <TournamentBody fieldErrors={state.fieldErrors} />
        )}

        {showPricing && <PricingSubsection fieldErrors={state.fieldErrors} />}
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
          </label>
          <select id="visibility" name="visibility" defaultValue="public" className={inputClass}>
            <option value="public">Public — anyone can find it</option>
            <option value="invite_only">Invite only</option>
            <option value="friends_of_host">People the host follows</option>
            <option value="friends_of_attendees">People attendees follow</option>
          </select>
          <FieldError name="visibility" errors={state.fieldErrors} />
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
            placeholder="Rally scoring to 25, win by 2. Captain's choice on lets."
            className={inputClass}
          />
          <FieldError name="rules" errors={state.fieldErrors} />
        </div>
        <AdvancedDetailsPanel hideExternal />
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

/* ─────────────────────────────────────────────────────────────────────────
   Sub-components — kept in this file to avoid a directory full of one-use
   helpers. Each maps directly to one branch of the form-shape state machine.
───────────────────────────────────────────────────────────────────────── */

function OpenPlayBody({
  capacityKind,
  setCapacityKind,
  byPosition,
  positionCounts,
  setPositionCounts,
  positionTotal,
  fieldErrors,
}: {
  capacityKind: CapacityKind;
  setCapacityKind: (k: CapacityKind) => void;
  byPosition: boolean;
  positionCounts: Record<EventPosition, number>;
  setPositionCounts: React.Dispatch<React.SetStateAction<Record<EventPosition, number>>>;
  positionTotal: number;
  fieldErrors: Record<string, string> | undefined;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="surface" className={labelClass}>
            Surface
          </label>
          <select id="surface" name="surface" defaultValue="indoor" className={inputClass}>
            <option value="indoor">Indoor</option>
            <option value="grass">Grass</option>
            <option value="sand">Sand</option>
          </select>
          <FieldError name="surface" errors={fieldErrors} />
        </div>
        <SkillTierSelect fieldErrors={fieldErrors} />
      </div>

      <div>
        <p className={labelClass}>How many spots?</p>
        <div className="mt-2">
          <SegmentedControl<CapacityKind>
            value={capacityKind}
            ariaLabel="Capacity mode"
            onChange={setCapacityKind}
            options={[
              { value: 'unlimited', label: 'Unlimited' },
              { value: 'fixed', label: 'Fixed spots' },
              { value: 'by_position', label: 'By position' },
            ]}
          />
        </div>

        {capacityKind === 'fixed' && (
          <div className="mt-3 max-w-xs">
            <label htmlFor="maxSpots" className={labelClass}>
              Max spots
            </label>
            <input id="maxSpots" name="maxSpots" type="number" min={1} className={inputClass} />
            <FieldError name="capacity" errors={fieldErrors} />
          </div>
        )}

        {byPosition && (
          <div className="border-border-base mt-3 space-y-3 rounded-md border border-dashed p-3">
            <p className="text-muted text-xs">
              Set a target count for each indoor 6&apos;s position. Players over a position&apos;s
              count get a <span className="italic">waitlist</span> badge.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {EVENT_POSITIONS.map((pos) => (
                <div key={pos}>
                  <label htmlFor={`pos-${pos}`} className="text-fg block text-xs font-medium">
                    {POSITION_LABEL[pos] ?? pos}
                  </label>
                  <input
                    id={`pos-${pos}`}
                    name={`position_${pos}`}
                    type="number"
                    min={0}
                    max={50}
                    value={positionCounts[pos]}
                    onChange={(e) =>
                      setPositionCounts((c) => ({
                        ...c,
                        [pos]: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                    className={inputClass}
                  />
                </div>
              ))}
            </div>
            <p className="text-muted text-xs">
              Total: <span className="text-fg font-semibold">{positionTotal}</span> spots
            </p>
            <FieldError name="positionRoster" errors={fieldErrors} />
          </div>
        )}
      </div>

      <label className="bg-highlight/40 flex items-start gap-2 rounded-md p-3 text-sm">
        <input type="checkbox" name="joinAsHost" defaultChecked className="mt-0.5" />
        <span>
          <span className="text-fg font-medium">Sign me up as a player too</span>
          <span className="text-muted block text-xs">
            Adds you to the attendee list. You can leave any time.
            {byPosition && " You'll pick a position from the event page."}
          </span>
        </span>
      </label>
    </>
  );
}

function TournamentBody({ fieldErrors }: { fieldErrors: Record<string, string> | undefined }) {
  return (
    <>
      <div className="border-border-base bg-fg/[0.02] space-y-4 rounded-md border p-4">
        <div className="flex items-center justify-between">
          <span className="text-muted text-xs font-semibold tracking-wide uppercase">
            Division 1
          </span>
          <span className="text-muted text-xs">Primary division</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="surface" className={labelClass}>
              Surface
            </label>
            <select id="surface" name="surface" defaultValue="indoor" className={inputClass}>
              <option value="indoor">Indoor</option>
              <option value="grass">Grass</option>
              <option value="sand">Sand</option>
            </select>
            <FieldError name="surface" errors={fieldErrors} />
          </div>
          <div>
            <label htmlFor="format" className={labelClass}>
              Format
            </label>
            <select id="format" name="format" defaultValue="sixes" className={inputClass}>
              <option value="sixes">Sixes</option>
              <option value="quads">Quads</option>
              <option value="triples">Triples</option>
              <option value="doubles">Doubles</option>
            </select>
            <FieldError name="format" errors={fieldErrors} />
          </div>
          <div>
            <label htmlFor="gender" className={labelClass}>
              Gender
            </label>
            <select id="gender" name="gender" defaultValue="coed" className={inputClass}>
              <option value="coed">Coed</option>
              <option value="mens">Men&apos;s</option>
              <option value="womens">Women&apos;s</option>
            </select>
            <FieldError name="gender" errors={fieldErrors} />
          </div>
          <SkillTierSelect fieldErrors={fieldErrors} />
        </div>
      </div>

      <DivisionsRepeater defaultSurface="indoor" />
    </>
  );
}

function PricingSubsection({ fieldErrors }: { fieldErrors: Record<string, string> | undefined }) {
  return (
    <div className="border-border-base space-y-3 border-t pt-4">
      <div>
        <p className={labelClass}>Pricing</p>
        <p className="text-muted mt-1 text-xs">
          Leave at $0 for free. To charge, finish Stripe payout setup at{' '}
          <Link href="/profile/billing" className="text-primary hover:underline">
            Payouts &amp; Stripe
          </Link>
          .
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="priceUsd" className={labelClass}>
            Price (USD)
          </label>
          <input
            id="priceUsd"
            name="priceUsd"
            type="number"
            min="0"
            max="10000"
            step="0.01"
            defaultValue="0"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="refundWindowHours" className={labelClass}>
            Refund window (h)
          </label>
          <input
            id="refundWindowHours"
            name="refundWindowHours"
            type="number"
            min="0"
            max="720"
            step="1"
            defaultValue="24"
            className={inputClass}
          />
          <p className="text-muted mt-1 text-xs">
            Hours before start when self-cancel refunds work. 0 disables.
          </p>
        </div>
        <div className="flex items-end">
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" name="hostAbsorbsFee" className="mt-0.5" />
            <span>
              <span className="text-fg font-medium">Absorb the 5% service fee</span>
              <span className="text-muted block">Otherwise added to ticket price.</span>
            </span>
          </label>
        </div>
      </div>
      <FieldError name="priceCents" errors={fieldErrors} />
    </div>
  );
}

function ExternalFields({
  type,
  fieldErrors,
}: {
  type: EventType;
  fieldErrors: Record<string, string> | undefined;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="surface" className={labelClass}>
            Surface
          </label>
          <select id="surface" name="surface" defaultValue="indoor" className={inputClass}>
            <option value="indoor">Indoor</option>
            <option value="grass">Grass</option>
            <option value="sand">Sand</option>
          </select>
          <FieldError name="surface" errors={fieldErrors} />
        </div>
        <SkillTierSelect fieldErrors={fieldErrors} />
        {type === EventType.Tournament && (
          <>
            <div>
              <label htmlFor="format" className={labelClass}>
                Format
              </label>
              <select id="format" name="format" defaultValue="sixes" className={inputClass}>
                <option value="sixes">Sixes</option>
                <option value="quads">Quads</option>
                <option value="triples">Triples</option>
                <option value="doubles">Doubles</option>
              </select>
              <FieldError name="format" errors={fieldErrors} />
            </div>
            <div>
              <label htmlFor="gender" className={labelClass}>
                Gender
              </label>
              <select id="gender" name="gender" defaultValue="coed" className={inputClass}>
                <option value="coed">Coed</option>
                <option value="mens">Men&apos;s</option>
                <option value="womens">Women&apos;s</option>
              </select>
              <FieldError name="gender" errors={fieldErrors} />
            </div>
          </>
        )}
      </div>
      <div>
        <label htmlFor="externalRegistrationUrl" className={labelClass}>
          Registration URL
        </label>
        <input
          id="externalRegistrationUrl"
          name="externalRegistrationUrl"
          type="url"
          maxLength={2048}
          placeholder="https://…"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="externalRegistrationInstructions" className={labelClass}>
          Instructions <span className="text-fg/50">(optional)</span>
        </label>
        <textarea
          id="externalRegistrationInstructions"
          name="externalRegistrationInstructions"
          rows={2}
          maxLength={2000}
          placeholder="e.g. Register via AES by Friday. Bring photo ID to check-in."
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="paymentInstructions" className={labelClass}>
          Payment instructions <span className="text-fg/50">(optional)</span>
        </label>
        <textarea
          id="paymentInstructions"
          name="paymentInstructions"
          rows={2}
          maxLength={2000}
          placeholder="e.g. Venmo @league-org or pay at check-in (cash/card)."
          className={inputClass}
        />
      </div>
    </div>
  );
}
