'use client';

import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { EventType } from '@pickupvb/domain';
import AddressAutocomplete, { type Suggestion } from '@/components/address-autocomplete';
import DateTimePicker from '@/components/datetime-picker';
import { createEventAction, type CreateEventState } from './actions';

const initialState: CreateEventState = {};

const labelClass = 'block text-sm font-medium text-net-900';
const inputClass =
    'mt-1 block w-full rounded-md border border-net-900/20 bg-white px-3 py-2 text-sm shadow-sm focus:border-court-500 focus:outline-none focus:ring-1 focus:ring-court-500';
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
            className="rounded-md bg-court-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-court-700 disabled:opacity-50"
        >
            {pending ? 'Creating…' : 'Create event'}
        </button>
    );
}

export default function NewEventForm() {
    const [state, formAction] = useFormState(createEventAction, initialState);
    const [type, setType] = useState<string>(EventType.OpenPlay);
    const [capacityKind, setCapacityKind] = useState<'unlimited' | 'fixed'>('unlimited');
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
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {state.error}
                </div>
            )}

            <fieldset className="space-y-4">
                <legend className="text-lg font-semibold text-net-900">Basics</legend>
                <div>
                    <label htmlFor="title" className={labelClass}>Title</label>
                    <input id="title" name="title" required minLength={3} maxLength={120} className={inputClass} />
                    <FieldError name="title" errors={state.fieldErrors} />
                </div>
                <div>
                    <label htmlFor="description" className={labelClass}>Description</label>
                    <textarea id="description" name="description" rows={3} maxLength={4000} className={inputClass} />
                    <FieldError name="description" errors={state.fieldErrors} />
                </div>
                <div>
                    <label htmlFor="rules" className={labelClass}>Rules</label>
                    <textarea id="rules" name="rules" rows={2} maxLength={4000} className={inputClass} />
                    <FieldError name="rules" errors={state.fieldErrors} />
                </div>
            </fieldset>

            <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <legend className="col-span-full text-lg font-semibold text-net-900">Format</legend>
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
                        <option value="friends_of_host">Friends of host</option>
                        <option value="friends_of_attendees">Friends of attendees</option>
                    </select>
                    <FieldError name="visibility" errors={state.fieldErrors} />
                </div>
            </fieldset>

            {type === EventType.OpenPlay && (
                <fieldset className="space-y-3 rounded-md border border-net-900/10 p-4">
                    <legend className="px-1 text-sm font-semibold text-net-900">Capacity</legend>
                    <div className="flex gap-4 text-sm">
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
                </fieldset>
            )}

            <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <legend className="col-span-full text-lg font-semibold text-net-900">When</legend>
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
                <legend className="text-lg font-semibold text-net-900">Location</legend>
                <div>
                    <label htmlFor="addressSearch" className={labelClass}>Search address or venue</label>
                    <AddressAutocomplete onPick={applySuggestion} inputClass={inputClass} />
                    <p className="mt-1 text-xs text-net-800/70">
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
                <Link href="/events" className="text-sm text-court-600 hover:underline">
                    ← Cancel
                </Link>
                <SubmitButton />
            </div>
        </form>
    );
}
