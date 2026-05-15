'use client';

import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import AddressAutocomplete, { type Suggestion } from '@/components/address-autocomplete';
import DateTimePicker from '@/components/datetime-picker';
import { editEventAction, type EditEventState } from './actions';

const initialState: EditEventState = {};

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
            {pending ? 'Saving…' : 'Save changes'}
        </button>
    );
}

export type EditEventFormProps = {
    eventId: string;
    isOpenPlay: boolean;
    pricingLocked: boolean;
    initial: {
        title: string;
        description: string;
        rules: string;
        skillLevel: string;
        visibility: string;
        startsAt: Date;
        endsAt: Date;
        capacityKind: 'unlimited' | 'fixed' | null;
        maxSpots: number | null;
        addressLine: string;
        city: string;
        region: string;
        postalCode: string;
        country: string;
        priceUsd: string;
        refundWindowHours: number;
        hostAbsorbsFee: boolean;
    };
};

export default function EditEventForm({
    eventId,
    isOpenPlay,
    pricingLocked,
    initial,
}: EditEventFormProps) {
    const [state, formAction] = useFormState(editEventAction, initialState);
    const [capacityKind, setCapacityKind] = useState<'unlimited' | 'fixed'>(
        initial.capacityKind === 'fixed' ? 'fixed' : 'unlimited',
    );
    const [addressLine, setAddressLine] = useState(initial.addressLine);
    const [city, setCity] = useState(initial.city);
    const [region, setRegion] = useState(initial.region);
    const [postalCode, setPostalCode] = useState(initial.postalCode);
    const [country, setCountry] = useState(initial.country);
    const [startsAt, setStartsAt] = useState<Date | null>(initial.startsAt);
    const [endsAt, setEndsAt] = useState<Date | null>(initial.endsAt);

    function applySuggestion(s: Suggestion) {
        setAddressLine(s.addressLine);
        setCity(s.city);
        setRegion(s.region);
        setPostalCode(s.postalCode);
        if (s.country) setCountry(s.country);
    }

    return (
        <form action={formAction} className="space-y-8">
            <input type="hidden" name="eventId" value={eventId} />

            {state.error && (
                <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {state.error}
                </div>
            )}

            <fieldset className="space-y-4">
                <legend className="text-lg font-semibold text-fg">Basics</legend>
                <div>
                    <label htmlFor="title" className={labelClass}>Title</label>
                    <input id="title" name="title" required minLength={3} maxLength={120} defaultValue={initial.title} className={inputClass} />
                    <FieldError name="title" errors={state.fieldErrors} />
                </div>
                <div>
                    <label htmlFor="description" className={labelClass}>
                        Description <span className="text-fg/50">(optional)</span>
                    </label>
                    <textarea id="description" name="description" rows={3} maxLength={4000} defaultValue={initial.description} className={inputClass} />
                </div>
                <div>
                    <label htmlFor="rules" className={labelClass}>
                        Rules <span className="text-fg/50">(optional)</span>
                    </label>
                    <textarea id="rules" name="rules" rows={2} maxLength={4000} defaultValue={initial.rules} className={inputClass} />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                        <label htmlFor="skillLevel" className={labelClass}>Skill level</label>
                        <select id="skillLevel" name="skillLevel" defaultValue={initial.skillLevel} className={inputClass}>
                            <option value="beginner">Beginner</option>
                            <option value="intermediate">Intermediate</option>
                            <option value="advanced">Advanced</option>
                            <option value="competitive">Competitive</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="visibility" className={labelClass}>Visibility</label>
                        <select id="visibility" name="visibility" defaultValue={initial.visibility} className={inputClass}>
                            <option value="public">Public</option>
                            <option value="invite_only">Invite only</option>
                            <option value="friends_of_host">People the host follows</option>
                            <option value="friends_of_attendees">People attendees follow</option>
                        </select>
                    </div>
                </div>
            </fieldset>

            {isOpenPlay && (
                <fieldset className="space-y-3 rounded-md border border-border-base p-4">
                    <legend className="px-1 text-sm font-semibold text-fg">Capacity</legend>
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
                            <input
                                id="maxSpots"
                                name="maxSpots"
                                type="number"
                                min={1}
                                defaultValue={initial.maxSpots ?? ''}
                                className={inputClass}
                            />
                            <FieldError name="maxSpots" errors={state.fieldErrors} />
                            <p className="mt-1 text-xs text-muted">
                                Cannot drop below current attendee count.
                            </p>
                        </div>
                    )}
                </fieldset>
            )}

            <fieldset className="space-y-3 rounded-md border border-border-base p-4">
                <legend className="px-1 text-sm font-semibold text-fg">Pricing</legend>
                {pricingLocked && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                        Pricing is locked because at least one ticket has been sold.
                        Refund all attendees first to change price, fee, or refund window.
                    </div>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                        <label htmlFor="priceUsd" className={labelClass}>Price (USD)</label>
                        <input
                            id="priceUsd"
                            name="priceUsd"
                            type="number"
                            min="0"
                            max="10000"
                            step="0.01"
                            defaultValue={initial.priceUsd}
                            disabled={pricingLocked}
                            className={inputClass}
                        />
                    </div>
                    <div>
                        <label htmlFor="refundWindowHours" className={labelClass}>
                            Refund window (hours)
                        </label>
                        <input
                            id="refundWindowHours"
                            name="refundWindowHours"
                            type="number"
                            min="0"
                            max="720"
                            step="1"
                            defaultValue={initial.refundWindowHours}
                            disabled={pricingLocked}
                            className={inputClass}
                        />
                    </div>
                    <div className="flex items-end">
                        <label className="flex items-start gap-2 text-xs">
                            <input
                                type="checkbox"
                                name="hostAbsorbsFee"
                                defaultChecked={initial.hostAbsorbsFee}
                                disabled={pricingLocked}
                                className="mt-0.5"
                            />
                            <span>
                                <span className="font-medium text-fg">
                                    Host absorbs the 5% service fee
                                </span>
                                <span className="block text-muted">
                                    Otherwise added on top of ticket price.
                                </span>
                            </span>
                        </label>
                    </div>
                </div>
            </fieldset>

            <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <legend className="col-span-full text-lg font-semibold text-fg">When</legend>
                <div>
                    <label htmlFor="startsAt" className={labelClass}>Starts at</label>
                    <DateTimePicker
                        name="startsAt"
                        value={startsAt}
                        onChange={setStartsAt}
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
                        {...(startsAt ? { minDate: startsAt } : {})}
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
                </div>
                <div>
                    <label htmlFor="addressLine" className={labelClass}>Address</label>
                    <input
                        id="addressLine"
                        name="addressLine"
                        required
                        maxLength={200}
                        value={addressLine}
                        onChange={(e) => setAddressLine(e.target.value)}
                        className={inputClass}
                    />
                    <FieldError name="addressLine" errors={state.fieldErrors} />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                        <label htmlFor="city" className={labelClass}>City</label>
                        <input id="city" name="city" required maxLength={100} value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                        <label htmlFor="region" className={labelClass}>State / region</label>
                        <input id="region" name="region" maxLength={100} value={region} onChange={(e) => setRegion(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                        <label htmlFor="postalCode" className={labelClass}>Postal code</label>
                        <input id="postalCode" name="postalCode" maxLength={20} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                        <label htmlFor="country" className={labelClass}>Country</label>
                        <input id="country" name="country" required maxLength={100} value={country} onChange={(e) => setCountry(e.target.value)} className={inputClass} />
                    </div>
                </div>
            </fieldset>

            <div className="flex items-center justify-between">
                <Link href={`/events/${eventId}`} className="text-sm text-primary hover:underline">
                    ← Cancel
                </Link>
                <SubmitButton />
            </div>
        </form>
    );
}
