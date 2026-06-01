'use client';

import { useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { useToast } from '@/components/toast';
import { secondaryButtonClass } from '@/components/primary-button';

export function NearMeButton({ basePath = '/events' }: { basePath?: Route } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const { show } = useToast();

  function locate() {
    if (!('geolocation' in navigator)) {
      show({ variant: 'error', message: 'Geolocation not supported by this browser.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('lat', pos.coords.latitude.toFixed(6));
        params.set('lng', pos.coords.longitude.toFixed(6));
        if (!params.get('radiusKm')) params.set('radiusKm', '40');
        params.delete('page');
        start(() => router.push(`${basePath}?${params.toString()}` as Route));
      },
      (err) =>
        show({
          variant: 'error',
          title: "Couldn't read your location",
          message: err.message || 'Unable to read your location.',
        }),
      { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: 10_000 },
    );
  }

  return (
    <button
      type="button"
      onClick={locate}
      disabled={pending}
      className={`${secondaryButtonClass('sm')} gap-1.5`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
      {pending ? 'Locating…' : 'Near me'}
    </button>
  );
}
