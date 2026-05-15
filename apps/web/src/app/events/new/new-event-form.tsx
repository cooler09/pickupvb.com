'use client';

import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { EVENT_POSITIONS, EventPosition, EventType } from '@pickupvb/domain';
import AddressAutocomplete, { type Suggestion } from '@/components/address-autocomplete';
import DateTimePicker from '@/components/datetime-picker';
import { POSITION_LABEL } from '@/lib/enum-labels';
import { createEventAction, type CreateEventState } from './actions';

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

const labelClass = 'block text-sm font-medium text-fg';
const inputClass =
    'mt-1 block w-full rounded-md border border-border-base bg-surface px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';
const errorClass = 'mt-1 text-xs text-red-600';

function FieldError({ name, errors }: { name: string; errors: Record<string, string> | undefined }) {
    const msg = errors?.[name];
    if (!msg) return null;
    return <p className={errorClass}>{msg}</p>;
}

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 disabled:opacity-50"
        >
            {pending ? 'Creating…' : 'Create event'}
        </button>
    );
}

export default function NewEventForm({
    hostableGroups = [],
}: {
    hostableGroups?: { id: string; name: string }[];
}) {
    const [state, formAction] = useFormState(createEventAction, initialState);
    const [type, setType] = useState<string>(EventType.OpenPlay);
    const [capacityKind, setCapacityKind] = useState<'unlimited' | 'fixed'>('unlimited');
    const [byPosition, setByPosition] = useState(false);
    const [positionCounts, setPositionCounts] =
        useState<Record<EventPosition, number>>(DEFAULT_POSITION_ROSTER);
    const positionTotal = Object.values(positionCounts).reduce((a, b) => a + b, 0);
    const [addressLine, setAddressLine] = useState('');
    const [city, setCity] = useState('');
    const [region, setRegion] = useState('');
    const [postalCode, setPostalCode] = useState('');
    const [country, setCountry] = useState('USA');
    const [startsAt, setStartsAt] = useState<Date | null>(null);
    const [endsAt, setEndsAt] = useState<Date | null>(null);

    function applySuggestion(s: Suggestion) {
        setAddressLine(s.addressLine);
        setCity(s.city);
        setRegion(s.region);
        setPostalCode(s.postalCode);
        if (s.country) setCountry(s.country);
    }

    return (
        <form action={formAction} className="space-y-8">
            {state.error && (
                <div
                    role="alert"
                    className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                >
                    {state.error}
                </div>
            )}

            <fieldset className="space-y-4">
                <legend className="text-lg font-semibold text-fg">Basics</legend>
                <div>
                    <label htmlFor="hostGroupId" className={labelClass}>Host as</label>
                    <select id="hostGroupId" name="hostGroupId" defaultValue="" className={inputClass}>
                        <option value="">Yourself</option>
                        {hostableGroups.map((g) => (
                            <option key={g.id} value={g.id}>
                                {g.name}
                            </option>
                        ))}
                    </select>
                    <p className="mt-1 text-xs text-muted">
                        Hosting on behalf of a group? You can pick any group you own or admin.
                    </p>
                </div>
                <div>
                    <label htmlFor="title" className={labelClass}>Title</label>
                    <input id="title" name="title" required minLength={3} maxLength={120} className={inputClass} />
                    <FieldError name="title" errors={state.fieldErrors} />
                </div>
                <div>
                    <label htmlFor="description" className={labelClass}>
                        Description <span className="text-fg/50">(optional)</span>
                    </label>
                    <textarea id="description" name="description" rows={3} maxLength={4000} className={inputClass} />
                    <FieldError name="description" errors={state.fieldErrors} />
                </div>
                <div>
                    <label htmlFor="rules" className={labelClass}>
                        Rules <span className="text-fg/50">(optional)</span>
                    </label>
                    <textarea id="rules" name="rules" rows={2} maxLength={4000} className={inputClass} />
                    <FieldError name="rules" errors={state.fieldErrors} />
                </div>
            </fieldset>

            <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <legend className="col-span-full text-lg font-semibold text-fg">Format</legend>
                <div>
                    <label htmlFor="type" className={labelClass}>Event type</label>
                    <select id="type" name="type" value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
                        <option value="open_play">Open play</option>
                        <option value="tournament">Tournament</option>
                    </select>
                    <FieldError name="type" errors={state.fieldErrors} />
                </div>
                <div>
                    <label htmlFor="surface" className={labelClass}>Surface</label>
                    <select id="surface" name="surface" defaultValue="indoor" className={inputClass}>
                        <option value="indoor">Indoor</option>
                        <option value="grass">Grass</option>
                        <option value="sand">Sand</option>
                    </select>
                    <FieldError name="surface" errors={state.fieldErrors} />
                </div>
                {type === EventType.Tournament ? (
                    <>
                        <div>
                            <label htmlFor="format" className={labelClass}>Format</label>
                            <select id="format" name="format" defaultValue="sixes" className={inputClass}>
                                <option value="sixes">Sixes</option>
                                <option value="quads">Quads</option>
                                <option value="triples">Triples</option>
                                <option value="doubles">Doubles</option>
                            </select>
                            <FieldError name="format" errors={state.fieldErrors} />
                        </div>
                        <div>
                            <label htmlFor="gender" className={labelClass}>Gender</label>
                            <select id="gender" name="gender" defaultValue="coed" className={inputClass}>
                                <option value="coed">Coed</option>
                                <option value="mens">Men&apos;s</option>
                                <option value="womens">Women&apos;s</option>
                            </select>
                            <FieldError name="gender" errors={state.fieldErrors} />
                        </div>
                    </>
                ) : null}
                <div>
                    <label htmlFor="skillLevel" className={labelClass}>Skill level</label>
                    <select id="skillLevel" name="skillLevel" defaultValue="intermediate" className={inputClass}>
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                        <option value="competitive">Competitive</option>
                    </select>
                    <FieldError name="skillLevel" errors={state.fieldErrors} />
                </div>
                <div>
                    <label htmlFor="visibility" className={labelClass}>Visibility</label>
                    <select id="visibility" name="visibility" defaultValue="public" className={inputClass}>
                        <option value="public">Public</option>
                        <option value="invite_only">Invite only</option>
                        <option value="friends_of_host">People the host follows</option>
                        <option value="friends_of_attendees">People attendees follow</option>
                    </select>
                    <FieldError name="visibility" errors={state.fieldErrors} />
                </div>
            </fieldset>

            {type === EventType.OpenPlay && (
                <fieldset className="space-y-3 rounded-md border border-border-base p-4">
                    <legend className="px-1 text-sm font-semibold text-fg">Capacity</legend>
                    <label className="flex items-start gap-2 text-sm">
                        <input
                            type="checkbox"
                            name="byPosition"
                            checked={byPosition}
                            onChange={(e) => setByPosition(e.target.checked)}
                            className="mt-0.5"
                        />
                        <span>
                            <span className="font-medium text-fg">Sign up by position</span>
                            <span className="block text-xs text-muted">
                                For indoor 6&apos;s — set a target count per position
                                (Setter, Outside, etc.). Players pick a position when
                                they join.
                            </span>
                        </span>
                    </label>

                    {byPosition ? (
                        <div className="space-y-2 border-t border-border-base pt-3">
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                {EVENT_POSITIONS.map((pos) => (
                                    <div key={pos}>
                                        <label
                                            htmlFor={`pos-${pos}`}
                                            className="block text-xs font-medium text-fg"
                                        >
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
                            <p className="text-xs text-muted">
                                Total: <span className="font-semibold text-fg">{positionTotal}</span>{' '}
                                spots. Players over a position&apos;s count get a
                                <span className="ml-1 italic">waitlist</span> badge.
                            </p>
                            <FieldError name="positionRoster" errors={state.fieldErrors} />
                        </div>
                    ) : (
                        <>
                            <div className="flex gap-4 border-t border-border-base pt-3 text-sm">
                                <label className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        name="capacityKind"
                                        value="unlimited"
                                        checked={capacityKind === 'unlimited'}
                                        onChange={() => setCapacityKind('unlimited')}
                                    />
                                    Unlimited
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        name="capacityKind"
                                        value="fixed"
                                        checked={capacityKind === 'fixed'}
                                        onChange={() => setCapacityKind('fixed')}
                                    />
                                    Fixed spots
                                </label>
                            </div>
                            {capacityKind === 'fixed' && (
                                <div>
                                    <label htmlFor="maxSpots" className={labelClass}>Max spots</label>
                                    <input id="maxSpots" name="maxSpots" type="number" min={1} className={inputClass} />
                                </div>
                            )}
                            <FieldError name="capacity" errors={state.fieldErrors} />
                        </>
                    )}
                    <label className="mt-2 flex items-start gap-2 border-t border-border-base pt-3 text-sm">
                        <input
                            type="checkbox"
                            name="joinAsHost"
                            defaultChecked
                            className="mt-0.5"
                        />
                        <span>
                            <span className="font-medium text-fg">Sign me up as a player too</span>
                            <span className="block text-xs text-muted">
                                Adds you to the attendee list. You can leave any time.
                                {byPosition && ' (You\'ll pick a position from the event page.)'}
                            </span>
                        </span>
                    </label>
                </fieldset>
            )}

            <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <legend className="col-span-full text-lg font-semibold text-fg">When</legend>
                <div>
                    <label htmlFor="startsAt" className={labelClass}>Starts at</label>
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
                    <label htmlFor="endsAt" className={labelClass}>Ends at</label>
                    <DateTimePicker
                        name="endsAt"
                        value={endsAt}
                        onChange={setEndsAt}
                        minDate={startsAt ?? new Date()}
                        inputClass={inputClass}
                    />
                    <FieldError name="endsAt" errors={state.fieldErrors} />
                </div>
            </fieldset>

            <fieldset className="space-y-4">
                <legend className="text-lg font-semibold text-fg">Location</legend>
                <div>
                    <label htmlFor="addressSearch" className={labelClass}>Search address or venue</label>
                    <AddressAutocomplete onPick={applySuggestion} inputClass={inputClass} />
                    <p className="mt-1 text-xs text-muted">
                        Pick a result to auto-fill the fields below. You can edit them after.
                    </p>
                </div>
                <div>
                    <label htmlFor="addressLine" className={labelClass}>Address</label>
                    <input id="addressLine" name="addressLine" required maxLength={200} value={addressLine} onChange={(e) => setAddressLine(e.target.value)} className={inputClass} />
                    <FieldError name="location.addressLine" errors={state.fieldErrors} />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                        <label htmlFor="city" className={labelClass}>City</label>
                        <input id="city" name="city" required maxLength={100} value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
                        <FieldError name="location.city" errors={state.fieldErrors} />
                    </div>
                    <div>
                        <label htmlFor="region" className={labelClass}>State / region</label>
                        <input id="region" name="region" maxLength={100} value={region} onChange={(e) => setRegion(e.target.value)} className={inputClass} />
                        <FieldError name="location.region" errors={state.fieldErrors} />
                    </div>
                    <div>
                        <label htmlFor="postalCode" className={labelClass}>Postal code</label>
                        <input id="postalCode" name="postalCode" maxLength={20} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className={inputClass} />
                        <FieldError name="location.postalCode" errors={state.fieldErrors} />
                    </div>
                    <div>
                        <label htmlFor="country" className={labelClass}>Country</label>
                        <input id="country" name="country" required maxLength={100} value={country} onChange={(e) => setCountry(e.target.value)} className={inputClass} />
                        <FieldError name="location.country" errors={state.fieldErrors} />
                    </div>
                </div>
            </fieldset>

            <div className="flex items-center justify-between">
                <Link href="/events" className="text-sm text-primary hover:underline">
                    ← Cancel
                </Link>
                <SubmitButton />
            </div>
        </form>
    );
}
