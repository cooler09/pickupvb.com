'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { useToast } from '@/components/toast';
import { secondaryButtonClass } from '@/components/primary-button';
import { geocodePlaceAction } from './location-actions';

/**
 * Manual location entry for the events list: geocode a city or ZIP and re-run
 * the search around it. Complements the GPS-based Near-me button (this is the
 * fallback when the user denies geolocation or wants to browse another city).
 * Preserves the active filters in the URL, like Near-me, and resets pagination.
 */
export function LocationSearch({
  basePath = '/events',
  inputLabel = 'Find events by city or ZIP code',
  submitLabel = 'Search',
}: { basePath?: Route; inputLabel?: string; submitLabel?: string } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const [value, setValue] = useState('');
  const { show } = useToast();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    start(async () => {
      const res = await geocodePlaceAction(q);
      if (!res) {
        show({
          variant: 'error',
          title: "Couldn't find that place",
          message: 'Try a city or ZIP code in the US.',
        });
        return;
      }
      const params = new URLSearchParams(searchParams.toString());
      params.set('lat', res.latitude.toFixed(6));
      params.set('lng', res.longitude.toFixed(6));
      if (!params.get('radiusKm')) params.set('radiusKm', '40');
      params.delete('page');
      router.push(`${basePath}?${params.toString()}` as Route);
    });
  }

  return (
    <form role="search" onSubmit={submit} className="flex items-center gap-1">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="City or ZIP"
        aria-label={inputLabel}
        className="border-border-base bg-md-surface-container w-32 rounded-md border px-3 py-2 text-sm sm:w-40"
      />
      <button type="submit" disabled={pending} className={secondaryButtonClass('sm')}>
        {pending ? 'Searching…' : submitLabel}
      </button>
    </form>
  );
}
